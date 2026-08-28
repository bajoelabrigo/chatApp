import { useState } from 'react';
import {
  View, Text, Modal, Pressable, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import { getSocket } from '../../services/socketService';
import { createOrGetConversation } from '../../services/conversationService';
import { reelShareUrl, type Reel } from '../../services/reelService';
import { emojiPickerTheme } from './reactions';
import BibleModal from '../chat/BibleModal';
import type { SharedBible } from '../../services/conversationService';

/**
 * Mensaje PRIVADO al autor de un reel o una historia: abre (o crea) el chat 1:1
 * con él y manda el mensaje. Es el gesto con el que una historia se convierte en
 * conversación, que es lo que hace que la gente publique otra.
 *
 * Va en una hoja propia, no en una barra siempre visible al pie: con la barra
 * fija convivían DOS cajas de texto en la misma pantalla —esta y la de
 * comentarios— con consecuencias opuestas (una la lee toda la comunidad, la otra
 * solo el autor), y ni ponerles etiqueta arreglaba que parecieran la misma cosa.
 * Ahora se abre una a la vez, desde su propio botón.
 *
 * El mensaje viaja como TEXTO con el enlace del reel: el chat ya pinta la vista
 * previa de los enlaces, así que la miniatura sale sola desde la ruta de Open
 * Graph, y no hace falta estrenar un `type` de mensaje.
 *
 * Espejo de `holy_app/frontend/src/components/reels/PrivateMessageModal.jsx`.
 */
export function PrivateMessageSheet({
  reel, token, colors, onClose,
}: {
  reel: Reel | null;
  token: string | null;
  colors: any;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [bibleOpen, setBibleOpen] = useState(false);

  const insertar = (t: string) =>
    setTexto((prev) => (prev ? `${prev}${prev.endsWith(' ') ? '' : ' '}${t}` : t));

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando || !token || !reel) return;
    const socket = getSocket();
    if (!socket) { Alert.alert('Sin conexión', 'Abre el chat e inténtalo de nuevo.'); return; }
    setEnviando(true);
    try {
      const conv = await createOrGetConversation(token, reel.author.id);
      socket.emit('message:send', {
        conversationId: conv._id,
        content: `${t}\n${reelShareUrl(reel.id)}`,
        type: 'text',
      });
      setTexto('');
      onClose();
      Alert.alert('Enviado', `Tu mensaje llegó a ${reel.author.name}`);
    } catch {
      Alert.alert('Error', 'No se pudo enviar el mensaje');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal visible={!!reel} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={onClose}>
          <Pressable
            onPress={() => {}}
            style={{ backgroundColor: colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>
              Mensaje para {reel?.author.name}
            </Text>
            {/* Lo que distingue esto de un comentario. Sin decirlo, alguien
                escribe en público creyendo que escribe en privado. */}
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
              Privado · solo {reel?.author.name} lo verá, en Mensajes
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
              <TouchableOpacity onPress={() => setEmojiOpen(true)} hitSlop={6} style={{ padding: 4 }}>
                <Ionicons name="happy-outline" size={22} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setBibleOpen(true)} hitSlop={6} style={{ padding: 4 }}>
                <Ionicons name="book-outline" size={22} color={colors.accent} />
              </TouchableOpacity>
              <TextInput
                autoFocus
                value={texto}
                onChangeText={setTexto}
                placeholder="Escribe tu mensaje…"
                placeholderTextColor={colors.textSecondary}
                style={{ flex: 1, backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14 }}
                onSubmitEditing={enviar}
                returnKeyType="send"
              />
              <TouchableOpacity
                onPress={enviar}
                disabled={!texto.trim() || enviando}
                style={{ backgroundColor: colors.accent, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', opacity: !texto.trim() || enviando ? 0.5 : 1 }}
              >
                {enviando ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={16} color="#fff" />}
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
          insertar(p.verses.map((v) => `📖 ${v.book} ${v.chapter}:${v.verse}: ${v.text}`).join('\n'));
        }}
      />
    </Modal>
  );
}
