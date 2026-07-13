import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';

// Grabación de notas de voz.
//
// Vivía dentro de `app/chat/[id].tsx` (2.200 líneas) repartida entre seis piezas
// de estado, dos temporizadores y dos funciones. Es un bloque autocontenido —
// empieza, para, y produce un fichero— así que sale a un hook: la pantalla ahora
// solo pregunta "¿está grabando?" y dice "envía esto".

// Cuántas barras tiene el medidor de volumen. Las nuevas entran por la derecha y
// empujan a las viejas, como el waveform del chat web.
const BAR_COUNT = 28;

interface Options {
  /** Qué hacer con el audio grabado. Si se cancela, no se llama. */
  onRecorded: (uri: string, mimeType: string, fileName: string) => void | Promise<void>;
}

export function useVoiceRecorder({ onRecorded }: Options) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });

  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [bars, setBars] = useState<number[]>([]);

  // `useRef` además del state: el botón del micrófono lee el valor en `onPressOut`,
  // que puede ejecutarse antes de que React haya aplicado el `setIsRecording`.
  const isRecordingRef = useRef(false);
  const secondsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (secondsTimer.current) {
      clearInterval(secondsTimer.current);
      secondsTimer.current = null;
    }
    if (meterTimer.current) {
      clearInterval(meterTimer.current);
      meterTimer.current = null;
    }
  };

  // Si la pantalla se desmonta grabando (el usuario sale del chat), hay que parar
  // los temporizadores y devolver el modo de audio: si no, el micrófono se queda
  // tomado y el intervalo sigue corriendo contra un componente muerto.
  useEffect(() => {
    return () => {
      clearTimers();
      if (isRecordingRef.current) {
        isRecordingRef.current = false;
        recorder.stop().catch(() => {});
        setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      }
    };
  }, []);

  const start = async () => {
    if (isRecordingRef.current) return;

    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso denegado', 'Activa el micrófono en Ajustes.');
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      await recorder.record();

      isRecordingRef.current = true;
      setIsRecording(true);
      setSeconds(0);
      setBars(new Array(BAR_COUNT).fill(0));

      secondsTimer.current = setInterval(() => setSeconds((s) => s + 1), 1000);

      // Medidor de volumen: `metering` viene en dBFS. Si el dispositivo no lo da,
      // se dibuja una onda suave al azar — sin esto la barra se quedaría plana y
      // parecería que no se está grabando.
      meterTimer.current = setInterval(() => {
        let level: number;
        try {
          const m = recorder.getStatus?.()?.metering;
          level =
            typeof m === 'number' && isFinite(m)
              ? Math.max(0.03, Math.min(1, (m + 50) / 50)) // -50 dB → 0, 0 dB → 1
              : 0.15 + Math.random() * 0.5;
        } catch {
          level = 0.15 + Math.random() * 0.5;
        }

        setBars((prev) => {
          const base = prev.length ? prev : new Array(BAR_COUNT).fill(0);
          const next = base.slice(1);
          next.push(level);
          return next;
        });
      }, 80);
    } catch {
      Alert.alert('Error', 'No se pudo iniciar la grabación');
    }
  };

  /** Para de grabar. Con `cancel`, tira lo grabado en vez de enviarlo. */
  const stop = async (cancel = false) => {
    if (!isRecordingRef.current) return;

    clearTimers();
    isRecordingRef.current = false;
    setIsRecording(false);
    setSeconds(0);
    setBars([]);

    try {
      await recorder.stop();
      if (!cancel && recorder.uri) {
        await onRecorded(recorder.uri, 'audio/m4a', `voice_${Date.now()}.m4a`);
      }
    } catch {
      // Silencioso: si la grabación falló, no hay nada que enviar y avisar de un
      // error aquí solo asustaría (el usuario ya ve que no se envió nada).
    } finally {
      await setAudioModeAsync({ allowsRecording: false });
    }
  };

  return { isRecording, seconds, bars, start, stop };
}
