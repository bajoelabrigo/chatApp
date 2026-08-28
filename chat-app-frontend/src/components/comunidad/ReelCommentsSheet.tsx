import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Image, Modal, Pressable, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import { addReelComment, getReelComments, type Reel, type ReelComment } from '../../services/reelService';
import { emojiPickerTheme } from './reactions';
import BibleModal from '../chat/BibleModal';
import type { SharedBible } from '../../services/conversationService';

/**
 * Hoja de comentarios de un reel o una historia. UNA sola para las dos
 * pantallas (`app/reels.tsx` y `app/stories.tsx`): estaba copiada en las dos y
 * cada arreglo había que hacerlo por duplicado. Espejo de
 * `holy_app/frontend/src/components/reels/ReelCommentsModal.jsx`.
 *
 * Trae lo que el chat tenía desde siempre y aquí faltaba:
 * - **Emojis y versículos**, insertados como TEXTO (un comentario es una cadena,
 *   no un documento con adjuntos como un post).
 * - **Responder a un comentario**: un solo nivel, como Instagram. Responder a
 *   una respuesta sigue colgando del comentario de arriba; anidar más hace
 *   ilegible un hilo en la pantalla de un teléfono.
 */
export function ReelCommentsSheet({
  reel, token, colors, onClose, onCountChange,
}: {
  reel: Reel | null;
  token: string | null;
  colors: any;
  onClose: () => void;
  onCountChange?: (reelId: string, count: number) => void;
}) {
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [text, setText] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [respondiendoA, setRespondiendoA] = useState<{ id: string; name: string } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [bibleOpen, setBibleOpen] = useState(false);

  const cargar = useCallback(async () => {
    if (!token || !reel) return;
    try { setComments(await getReelComments(token, reel.id)); } catch { /* best-effort */ }
  }, [token, reel?.id]);

  useEffect(() => {
    if (!reel) { setComments([]); setText(''); setRespondiendoA(null); return; }
    cargar();
  }, [reel?.id, cargar]);

  const insertar = (t: string) =>
    setText((prev) => (prev ? `${prev}${prev.endsWith(' ') ? '' : ' '}${t}` : t));

  const enviar = async () => {
    if (!token || !reel || !text.trim() || enviando) return;
    setEnviando(true);
    try {
      const { commentCount } = await addReelComment(token, reel.id, text.trim(), respondiendoA?.id);
      setText('');
      setRespondiendoA(null);
      onCountChange?.(reel.id, commentCount);
      await cargar();
    } catch { /* best-effort */ } finally { setEnviando(false); }
  };

  const avatar = (uri: string | undefined, nombre: string, size: number) =>
    uri ? (
      <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    ) : (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.42 }}>{nombre?.[0]?.toUpperCase()}</Text>
      </View>
    );

  return (
    <Modal visible={!!reel} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={onClose}>
          <Pressable
            onPress={() => {}}
            style={{ backgroundColor: colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30, maxHeight: '75%' }}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, textAlign: 'center', paddingVertical: 14 }}>
              Comentarios ({comments.length})
            </Text>

            <FlatList
              data={comments}
              keyExtractor={(c) => c.id ?? `${c.userId}-${c.at}`}
              style={{ flexGrow: 0 }}
              renderItem={({ item }) => (
                <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    {avatar(item.avatar, item.name, 32)}
                    <View style={{ flex: 1 }}>
                      <View style={{ backgroundColor: colors.bgPrimary, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
                        <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 12 }}>{item.name}</Text>
                        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{item.text}</Text>
                      </View>

                      {/* Sin id no se puede responder: son los comentarios
                          anteriores al cambio de esquema. */}
                      {!!item.id && (
                        <TouchableOpacity
                          onPress={() => setRespondiendoA({ id: item.id!, name: item.name })}
                          hitSlop={6}
                          style={{ paddingTop: 3, paddingLeft: 4 }}
                        >
                          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>Responder</Text>
                        </TouchableOpacity>
                      )}

                      {(item.replies ?? []).map((r, i) => (
                        <View key={`${r.userId}-${r.at}-${i}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6, paddingLeft: 10 }}>
                          <Ionicons name="return-down-forward" size={13} color={colors.textMuted} style={{ marginTop: 4 }} />
                          {avatar(r.avatar, r.name, 24)}
                          <View style={{ flex: 1, backgroundColor: colors.bgPrimary, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
                            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 11 }}>{r.name}</Text>
                            <Text style={{ color: colors.textPrimary, fontSize: 13 }}>{r.text}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 20 }}>
                  Sé el primero en comentar.
                </Text>
              }
            />

            {respondiendoA && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.bgPrimary }}>
                <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12 }}>
                  Respondiendo a <Text style={{ fontWeight: '700' }}>{respondiendoA.name}</Text>
                </Text>
                <TouchableOpacity onPress={() => setRespondiendoA(null)} hitSlop={8}>
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 10 }}>
              <TouchableOpacity onPress={() => setEmojiOpen(true)} hitSlop={6} style={{ padding: 4 }}>
                <Ionicons name="happy-outline" size={22} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setBibleOpen(true)} hitSlop={6} style={{ padding: 4 }}>
                <Ionicons name="book-outline" size={22} color={colors.accent} />
              </TouchableOpacity>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={respondiendoA ? `Responder a ${respondiendoA.name}…` : 'Escribe un comentario…'}
                placeholderTextColor={colors.textSecondary}
                style={{ flex: 1, backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14 }}
                onSubmitEditing={enviar}
                returnKeyType="send"
              />
              <TouchableOpacity
                onPress={enviar}
                disabled={!text.trim() || enviando}
                style={{ backgroundColor: colors.accent, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', opacity: !text.trim() || enviando ? 0.5 : 1 }}
              >
                <Ionicons name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>

      <EmojiPicker
        onEmojiSelected={(e: EmojiType) => { insertar(e.emoji); setEmojiOpen(false); }}
        open={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        theme={emojiPickerTheme(colors)}
        enableSearchBar
        enableRecentlyUsed
        categoryPosition="top"
      />

      <BibleModal
        visible={bibleOpen}
        onClose={() => setBibleOpen(false)}
        onSendBible={(p: SharedBible) => {
          setBibleOpen(false);
          // Texto plano: el comentario es una cadena, no una tarjeta.
          insertar(p.verses.map((v) => `📖 ${v.book} ${v.chapter}:${v.verse}: ${v.text}`).join('\n'));
        }}
      />
    </Modal>
  );
}
