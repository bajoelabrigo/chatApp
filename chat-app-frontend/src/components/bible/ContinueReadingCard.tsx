import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VERSION_META } from '../../constants/bible';
import type { BibleLastRead } from '../../store/useBibleStore';
import { PhotoCard, photoCardChip } from './PhotoCard';

// "Continuar leyendo" (#3): retoma la última posición guardada.
//
// Comparte el chasis (`PhotoCard`) con el versículo del día y la tarjeta de
// grupo: foto de fondo, velo y texto blanco. Antes era una barra plana del color
// de acento y desentonaba entre las otras dos.
interface Props {
  lastRead: BibleLastRead | null;
  photo: string | null;
  colors: any;
  onResume: () => void;
  onDismiss: () => void;
}

export function ContinueReadingCard({ lastRead, photo, colors, onResume, onDismiss }: Props) {
  if (!lastRead) return null;
  const vShort = VERSION_META[lastRead.version]?.short ?? lastRead.version;

  return (
    <PhotoCard label="Continuar leyendo" photo={photo} fallback="#7c2d12">
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 10 }}>
            {lastRead.book} {lastRead.chapter}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 3 }}>
            Lo dejaste aquí · {vShort}
          </Text>
        </View>

        {/* Descartar la tarjeta (no borra el progreso, solo la quita de la portada). */}
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ padding: 2 }}
        >
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
        <TouchableOpacity onPress={onResume} style={photoCardChip}>
          <Ionicons name="play" size={14} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Seguir leyendo</Text>
        </TouchableOpacity>
      </View>
    </PhotoCard>
  );
}
