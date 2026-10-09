import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localeFor, normLang, voicesFor, type NativeVoice } from '../lib/voiceRank';

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
// Voz elegida a mano, por idioma: { es: 'es-us-x-esd-local', en: … }. Sin
// entrada = automática (la mejor según voiceRank).
const VOICE_KEY = 'bible_speech_voice';

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
  const [allVoices, setAllVoices] = useState<NativeVoice[]>([]);
  const [voicePrefs, setVoicePrefs] = useState<Record<string, string>>({});

  // La cola y el índice van en refs: los callbacks de expo-speech se crean una
  // vez y leerían valores viejos si dependieran del estado.
  const queue = useRef<SpeechItem[]>([]);
  const index = useRef(0);
  const langRef = useRef('es');
  const rateRef = useRef(1);
  const stopped = useRef(false);
  // Voz con la que se está leyendo. Se resuelve al dar a play y al cambiarla.
  const voiceRef = useRef<NativeVoice | null>(null);
  const allVoicesRef = useRef<NativeVoice[]>([]);
  const prefsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    AsyncStorage.getItem(RATE_KEY).then((raw) => {
      const r = Number(raw);
      if (r) { setRate(r); rateRef.current = r; }
    });
    AsyncStorage.getItem(VOICE_KEY).then((raw) => {
      try {
        const p = raw ? JSON.parse(raw) : {};
        prefsRef.current = p;
        setVoicePrefs(p);
      } catch {}
    });
    // En Android la lista llega cuando el motor de voz termina de arrancar.
    Speech?.getAvailableVoicesAsync()
      .then((v) => {
        allVoicesRef.current = v as NativeVoice[];
        setAllVoices(v as NativeVoice[]);
      })
      .catch(() => {});
  }, []);

  // La voz elegida a mano si sigue instalada; si no, la mejor del idioma.
  const resolveVoice = useCallback((lang: string): NativeVoice | null => {
    const list = voicesFor(allVoicesRef.current, lang);
    const pref = prefsRef.current[lang];
    return list.find((v) => v.identifier === pref) ?? list[0] ?? null;
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
    const voice = voiceRef.current;
    Speech.speak(item.text, {
      language: voice ? normLang(voice.language) : localeFor(langRef.current),
      ...(voice ? { voice: voice.identifier } : {}),
      rate: rateRef.current,
      onDone: () => {
        if (stopped.current) return;
        index.current = i + 1;
        speakAt(index.current);
      },
      onError: () => {
        if (stopped.current) return;
        // Una voz elegida que falla (la "-network" sin conexión, o una que se
        // desinstaló): se repite ESTE versículo con la voz por defecto en vez
        // de saltárselo. El resto del capítulo sigue con la de por defecto.
        if (voiceRef.current) {
          voiceRef.current = null;
          speakAt(i);
          return;
        }
        // Sin voz que quitar: seguir con el siguiente en vez de colgarse.
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
    voiceRef.current = resolveVoice(langRef.current);
    const from = opts.startAt ? items.findIndex((i) => i.id === opts.startAt) : 0;
    index.current = from < 0 ? 0 : from;
    setSpeaking(true);
    setPaused(false);
    speakAt(index.current);
  }, [speakAt, resolveVoice]);

  // Cambiar de voz (id = null → automática). Mientras suena, el versículo actual
  // se repite con la voz nueva: elegirla es a la vez escucharla.
  const changeVoice = useCallback((lang: string, id: string | null) => {
    const next = { ...prefsRef.current };
    if (id) next[lang] = id;
    else delete next[lang];
    prefsRef.current = next;
    setVoicePrefs(next);
    AsyncStorage.setItem(VOICE_KEY, JSON.stringify(next));

    if (!Speech || lang !== langRef.current) return;
    voiceRef.current = resolveVoice(lang);
    if (queue.current.length && !stopped.current) {
      Speech.stop();
      setPaused(false);
      speakAt(index.current);
    }
  }, [resolveVoice, speakAt]);

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

  return {
    available, speaking, paused, currentId, rate, play, pause, resume, stop, changeRate,
    // Selector de voz
    lang: langRef.current,
    voices: voicesFor(allVoices, langRef.current),
    voicePref: voicePrefs[langRef.current] ?? null, // null = automática
    changeVoice,
  };
}
