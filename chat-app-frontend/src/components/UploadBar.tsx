import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Barra de progreso de una subida, con el % REAL de bytes enviados (no una
 * ruleta indeterminada). Espejo de `holy_app/frontend/src/components/UploadBar.jsx`.
 *
 * Sin ella, un video de 40 MB en una conexión de móvil es indistinguible de
 * "se colgó", y la gente vuelve a pulsar publicar.
 *
 * Al llegar a 100 el archivo ya viajó pero el servidor sigue trabajando: lo
 * recomprime con ffmpeg antes de mandarlo a Cloudinary, y en un video largo eso
 * son varios segundos. Por eso el 100% dice "procesando…" en vez de quedarse
 * quieto como si se hubiera atascado.
 */
export function UploadBar({
  percent,
  label = 'Subiendo video',
  colors,
}: {
  percent: number;
  label?: string;
  colors: any;
}) {
  const done = percent >= 100;
  return (
    <View style={{ width: '100%', maxWidth: 260, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
          {done ? 'Procesando en el servidor…' : `${label}… ${percent}%`}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
        <View
          style={{
            width: `${Math.min(100, Math.max(2, percent))}%`,
            height: '100%',
            borderRadius: 3,
            backgroundColor: colors?.accent ?? '#3B82F6',
          }}
        />
      </View>
    </View>
  );
}
