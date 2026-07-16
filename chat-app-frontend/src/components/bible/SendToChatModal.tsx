import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Conversation } from '../../services/conversationService';

// Elegir a qué chat enviar un pasaje bíblico (desde la página de la Biblia).
// Al pulsar una conversación se manda como mensaje `bible` (tarjeta con "Abrir en
// la Biblia"), igual que compartir desde el propio chat.
interface Props {
  visible: boolean;
  conversations: Conversation[];
  currentUserId?: string;
  reference: string; // "Juan 3:16" — vista previa de lo que se enviará/leerá
  colors: any;
  bottomInset: number;
  title?: string; // p. ej. "Enviar a un chat" o "Leer en grupo"
  onClose: () => void;
  onPick: (conv: Conversation) => void;
}

export function SendToChatModal({
  visible,
  conversations,
  currentUserId,
  reference,
  colors,
  bottomInset,
  title = 'Enviar a un chat',
  onClose,
  onPick,
}: Props) {
  const nameOf = (c: Conversation) => {
    if (c.isGroup) return c.groupName || 'Grupo';
    const other = c.participants?.find((p: any) => (p?._id ?? p) !== currentUserId);
    return other?.name || 'Usuario';
  };
  const avatarOf = (c: Conversation) => {
    if (c.isGroup) return (c as any).groupAvatar || null;
    const other = c.participants?.find((p: any) => (p?._id ?? p) !== currentUserId);
    return other?.avatar || null;
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
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
            maxHeight: '80%',
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12 }} />

          <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>{title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <Ionicons name="book" size={13} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                {reference}
              </Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: bottomInset + 20 }}>
            {conversations.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', padding: 24 }}>
                No tienes conversaciones todavía. Abre el chat e inicia una primero.
              </Text>
            ) : (
              conversations.map((c) => (
                <TouchableOpacity
                  key={c._id}
                  onPress={() => onPick(c)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12 }}
                >
                  {avatarOf(c) ? (
                    <Image source={{ uri: avatarOf(c)! }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={c.isGroup ? 'people' : 'person'} size={20} color={colors.textSecondary} />
                    </View>
                  )}
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                    {nameOf(c)}
                  </Text>
                  <Ionicons name="send" size={17} color={colors.accent} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
