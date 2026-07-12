import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { TAG_PRESETS } from '../../store/useBibleStore';
import type { VerseItem } from '../../constants/bible';

// Etiquetas de un versículo: chips sugeridos (+ los que ya use el usuario) y
// opción de crear la suya. Las etiquetas viven en el favorito, así que etiquetar
// guarda el versículo en favoritos — se avisa aquí mismo.
//
// El borrador de etiquetas es estado LOCAL del modal: fuera solo hacen falta el
// versículo y el guardado.
const MAX_TAGS = 6;

interface Props {
  verse: VerseItem | null;
  initialTags: string[];
  // Etiquetas que el usuario ya usó en otros versículos (se suman a las sugeridas).
  usedTags: string[];
  colors: any;
  bottomInset: number;
  onClose: () => void;
  onSave: (tags: string[]) => void;
}

export function VerseTagsModal({
  verse,
  initialTags,
  usedTags,
  colors,
  bottomInset,
  onClose,
  onSave,
}: Props) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [custom, setCustom] = useState('');

  if (!verse) return null;

  const suggestions = [...new Set([...TAG_PRESETS, ...usedTags])];

  const toggle = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length >= MAX_TAGS
        ? prev
        : [...prev, tag]
    );
  };

  const addCustom = () => {
    const tag = custom.trim();
    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return;
    setTags((prev) => [...prev, tag]);
    setCustom('');
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={onClose}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.bgSecondary,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              maxHeight: '92%',
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: bottomInset + 24 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>
                Etiquetas
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>
                {verse.book} {verse.chapter}:{verse.verse} — el versículo se guardará en favoritos con estas etiquetas.
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                {suggestions.map((t) => {
                  const on = tags.includes(t);
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => toggle(t)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
                        backgroundColor: on ? colors.accent : colors.bgTertiary,
                        borderWidth: 1, borderColor: on ? colors.accent : colors.border,
                      }}
                    >
                      <Text style={{ color: on ? '#fff' : colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <TextInput
                  value={custom}
                  onChangeText={setCustom}
                  maxLength={24}
                  placeholder="Crear otra etiqueta…"
                  placeholderTextColor={colors.inputPlaceholder}
                  style={{
                    flex: 1, backgroundColor: colors.inputBg, color: colors.inputText,
                    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
                  }}
                />
                <TouchableOpacity
                  onPress={addCustom}
                  style={{
                    paddingHorizontal: 16, justifyContent: 'center', borderRadius: 12,
                    backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.accent, fontWeight: '600' }}>Añadir</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>
                {tags.length}/{MAX_TAGS} etiquetas
              </Text>

              <TouchableOpacity
                onPress={() => onSave(tags)}
                style={{
                  marginTop: 20, paddingVertical: 14, borderRadius: 24,
                  alignItems: 'center', backgroundColor: colors.accent,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Guardar</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
