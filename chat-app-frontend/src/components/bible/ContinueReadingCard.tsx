import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VERSION_META } from '../../constants/bible';
import type { BibleLastRead } from '../../store/useBibleStore';

// "Continuar leyendo" (#3): retoma la última posición guardada.
interface Props {
  lastRead: BibleLastRead | null;
  colors: any;
  onResume: () => void;
  onDismiss: () => void;
}

export function ContinueReadingCard({ lastRead, colors, onResume, onDismiss }: Props) {
  if (!lastRead) return null;
  const vShort = VERSION_META[lastRead.version]?.short ?? lastRead.version;

  return (
    <View style={{
      marginHorizontal: 16, marginTop: 16, borderRadius: 16,
      backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center',
    }}>
      <TouchableOpacity
        onPress={onResume}
        activeOpacity={0.85}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}
      >
        <Ionicons name="book" size={22} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Continuar leyendo</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>
            {lastRead.book} {lastRead.chapter} · {vShort}
          </Text>
        </View>
        <Ionicons name="play" size={18} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDismiss}
        style={{ padding: 14 }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={18} color="rgba(255,255,255,0.9)" />
      </TouchableOpacity>
    </View>
  );
}
