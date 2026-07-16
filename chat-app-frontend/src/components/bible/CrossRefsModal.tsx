import { View, Text, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CrossRefsList } from './CrossRefsList';
import type { CrossRef } from '../../services/bibleService';
import type { VerseItem } from '../../constants/bible';

// Referencias cruzadas de un versículo, en hoja inferior. La lista (y su carga)
// vive en `CrossRefsList`, que se comparte con el panel de la lectura en vivo.
//
// Espejo en la web: holy_app/frontend/src/components/bible/CrossRefsModal.jsx.

interface Props {
  verse: VerseItem | null;
  token: string;
  version: string;
  colors: any;
  bottomInset: number;
  onClose: () => void;
  /** Navegar al pasaje tocado. La pantalla decide cómo (cambia libro/capítulo y resalta). */
  onOpenRef: (ref: CrossRef) => void;
}

export function CrossRefsModal({
  verse,
  token,
  version,
  colors,
  bottomInset,
  onClose,
  onOpenRef,
}: Props) {
  if (!verse) return null;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.bgSecondary,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '85%',
          }}
        >
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: bottomInset + 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="git-network-outline" size={20} color={colors.accent} />
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>
                Referencias cruzadas
              </Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>
              Pasajes relacionados con {verse.book} {verse.chapter}:{verse.verse}
            </Text>

            <CrossRefsList
              verse={verse}
              token={token}
              version={version}
              colors={colors}
              onOpenRef={onOpenRef}
            />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
