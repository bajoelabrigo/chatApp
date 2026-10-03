import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CrossRefsList } from './CrossRefsList';
import type { CrossRef } from '../../services/bibleService';
import type { VerseItem } from '../../constants/bible';

// Referencias cruzadas en panel lateral, para tablet y pantallas anchas. En el
// teléfono van en hoja inferior (`CrossRefsModal`), que tapa el texto; aquí el
// capítulo sigue a la izquierda y se puede saltar de una referencia a otra sin
// cerrar el panel. La lista (y su carga) es la misma `CrossRefsList`.

interface Props {
  verse: VerseItem;
  token: string;
  version: string;
  colors: any;
  width: number;
  bottomInset: number;
  onClose: () => void;
  onOpenRef: (ref: CrossRef) => void;
}

export function CrossRefsPanel({
  verse,
  token,
  version,
  colors,
  width,
  bottomInset,
  onClose,
  onOpenRef,
}: Props) {
  return (
    <View
      style={{
        width,
        backgroundColor: colors.bgSecondary,
        borderLeftWidth: 1,
        borderLeftColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border,
        }}
      >
        <Ionicons name="git-network-outline" size={18} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>
            Referencias cruzadas
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {verse.book} {verse.chapter}:{verse.verse}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset + 24 }}>
        <CrossRefsList
          verse={verse}
          token={token}
          version={version}
          colors={colors}
          onOpenRef={onOpenRef}
        />
      </ScrollView>
    </View>
  );
}
