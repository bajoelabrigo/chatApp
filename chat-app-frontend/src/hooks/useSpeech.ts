import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lectura en voz alta (#6) con expo-speech (voz del sistema: gratis, sin red).
//
// IMPORTANTE — `expo-speech` es un módulo NATIVO: solo existe en un APK
// compilado con él (`eas build`). En los APKs ya instalados, que reciben este
// código por OTA (`eas update`), el módulo nativo NO está y el import revienta.
// Por eso se carga con require() dentro de un try/catch: si no está, `available`
// es false y la pantalla simplemente no muestra el botón de escuchar, en vez de
// crashear. Al hacer el próximo build, se activa solo.
let Speech: typeof import('expo-speech') | null = null;
try {
  Speech = require('expo-speech');
} catch {
  Speech = null;
}

const RATE_KEY = 'bible_speech_rate';

export interface SpeechItem {
  id: string;
  text: string;
}

export function useSpeech() {
  const available = !!Speech;

  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [rate, setRate] = useState(1);

  // La cola y el índice van en refs: los callbacks de expo-speech se crean una
  // vez y leerían valores viejos si dependieran del estado.
  const queue = useRef<SpeechItem[]>([]);
  const index = useRef(0);
  const langRef = useRef('es');
  const rateRef = useRef(1);
  const stopped = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(RATE_KEY).then((raw) => {
      const r = Number(raw);
      if (r) { setRate(r); rateRef.current = r; }
    });
  }, []);

  const changeRate = useCallback((r: number) => {
    setRate(r);
    rateRef.current = r;
    AsyncStorage.setItem(RATE_KEY, String(r));
  }, []);

  const stop = useCallback(() => {
    if (!Speech) return;
    stopped.current = true;
    Speech.stop();
    setSpeaking(false);
    setPaused(false);
    setCurrentId(null);
    index.current = 0;
  }, []);

  // Se lee VERSÍCULO A VERSÍCULO (no el capítulo entero): así se puede resaltar
  // el que suena y no se depende de locuciones larguísimas.
  const speakAt = useCallback((i: number) => {
    if (!Speech || stopped.current) return;
    const item = queue.current[i];
    if (!item) {
      setSpeaking(false);
      setPaused(false);
      setCurrentId(null);
      return;
    }

    setCurrentId(item.id);
    Speech.speak(item.text, {
      language: langRef.current === 'en' ? 'en-US' : 'es-ES',
      rate: rateRef.current,
      onDone: () => {
        if (stopped.current) return;
        index.current = i + 1;
        speakAt(index.current);
      },
      // Si esa voz no está instalada en el móvil, seguir con el siguiente en vez
      // de dejar la reproducción colgada.
      onError: () => {
        if (stopped.current) return;
        index.current = i + 1;
        speakAt(index.current);
      },
    });
  }, []);

  const play = useCallback((items: SpeechItem[], opts: { lang?: string; startAt?: string } = {}) => {
    if (!Speech || !items.length) return;
    Speech.stop(); // por si quedaba algo de una lectura anterior
    stopped.current = false;
    queue.current = items;
    langRef.current = opts.lang ?? 'es';
    const from = opts.startAt ? items.findIndex((i) => i.id === opts.startAt) : 0;
    index.current = from < 0 ? 0 : from;
    setSpeaking(true);
    setPaused(false);
    speakAt(index.current);
  }, [speakAt]);

  // pause/resume de expo-speech no existe en Android: allí se para y se retoma
  // desde el versículo actual, que a efectos del usuario es lo mismo.
  const pause = useCallback(() => {
    if (!Speech) return;
    Speech.stop();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (!Speech) return;
    setPaused(false);
    stopped.current = false;
    speakAt(index.current);
  }, [speakAt]);

  // Al salir de la pantalla hay que parar: la voz seguiría sonando aunque el
  // componente se desmonte.
  useEffect(() => () => {
    stopped.current = true;
    Speech?.stop();
  }, []);

  return { available, speaking, paused, currentId, rate, play, pause, resume, stop, changeRate };
}
