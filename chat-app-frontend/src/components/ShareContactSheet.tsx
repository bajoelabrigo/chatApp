import { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, Modal, Pressable,
  TextInput, SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useChatsStore } from '../store/useChatsStore';
import { getSocket } from '../services/socketService';
import type { Conversation } from '../services/conversationService';

/** Cuántos chats llegan a "Frecuentes" (favoritos primero, se rellena con recientes). */
const FRECUENTES_MAX = 5;

type SharedContact = { _id: string; name: string; avatar?: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  contact: SharedContact;
  /** Se llama tras enviar, con el nº de chats a los que se envió. */
  onSent?: (count: number) => void;
};

type Row = { conv: Conversation; name: string; avatar?: string; isGroup: boolean };

function toRow(conv: Conversation, currentUserId: string | null): Row {
  if (conv.isGroup) {
    return { conv, name: conv.groupName ?? 'Grupo', avatar: conv.groupAvatar, isGroup: true };
  }
  const other = conv.participants.find((p) => p._id !== currentUserId);
  return { conv, name: other?.name ?? 'Usuario', avatar: other?.avatar, isGroup: false };
}

/**
 * Selector estilo WhatsApp para enviar un contacto a uno o varios chats.
 * Dos secciones (Frecuentes / Chats recientes), selección múltiple, barra
 * inferior con los nombres elegidos y un paso final de confirmación que
 * muestra la tarjeta del contacto antes de enviarla.
 */
export default function ShareContactSheet({ visible, onClose, contact, onSent }: Props) {
  const { colors } = useTheme();
  const conversations = useChatsStore((s) => s.conversations);
  const currentUserId = useChatsStore((s) => s.currentUserId);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  // Los chats bloqueados no reciben mensajes: no tiene sentido ofrecerlos.
  const rows = useMemo(
    () => conversations.filter((c) => !c.isBlocked).map((c) => toRow(c, currentUserId)),
    [conversations, currentUserId]
  );

  const byRecent = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(b.conv.lastMessageAt ?? b.conv.createdAt).getTime() -
          new Date(a.conv.lastMessageAt ?? a.conv.createdAt).getTime()
      ),
    [rows]
  );

  // "Frecuentes" = favoritos primero, completando hasta FRECUENTES_MAX con los
  // chats de actividad más reciente (no guardamos un contador real de frecuencia).
  const frequent = useMemo(() => {
    const favs = byRecent.filter((r) => r.conv.isFavorite);
    const rest = byRecent.filter((r) => !r.conv.isFavorite);
    return [...favs, ...rest].slice(0, FRECUENTES_MAX);
  }, [byRecent]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (r: Row) => !q || r.name.toLowerCase().includes(q);

    // Al buscar se colapsa todo en una sola lista: dos secciones con los mismos
    // resultados repetidos sería ruido.
    if (q) {
      const results = byRecent.filter(match);
      return results.length ? [{ title: 'Resultados', data: results }] : [];
    }

    const frequentIds = new Set(frequent.map((r) => r.conv._id));
    const recent = byRecent.filter((r) => !frequentIds.has(r.conv._id));

    return [
      ...(frequent.length ? [{ title: 'Frecuentes', data: frequent }] : []),
      ...(recent.length ? [{ title: 'Chats recientes', data: recent }] : []),
    ];
  }, [query, byRecent, frequent]);

  const selectedRows = useMemo(
    () => selected.map((id) => rows.find((r) => r.conv._id === id)).filter(Boolean) as Row[],
    [selected, rows]
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const reset = () => {
    setQuery('');
    setSelected([]);
    setConfirming(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleSend = () => {
    const socket = getSocket();
    if (!socket || selected.length === 0) return;

    // El backend crea el mensaje y lo reenvía por `message:new`; el store lo
    // inserta solo, así que no hace falta actualización optimista aquí.
    for (const conversationId of selected) {
      socket.emit('message:send', {
        conversationId,
        content: contact.name,
        type: 'contact',
        contactUserId: contact._id,
      });
    }

    const count = selected.length;
    reset();
    onClose();
    onSent?.(count);
  };

  const avatarFor = (name: string, uri?: string, size = 48, group = false) =>
    uri ? (
      <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    ) : (
      <View
        style={{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: group ? `${colors.accent}33` : colors.avatarBg,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {group ? (
          <FontAwesome5 name="user-friends" size={size * 0.36} color={colors.accent} />
        ) : (
          <Text style={{ color: colors.textPrimary, fontSize: size * 0.4, fontWeight: 'bold' }}>
            {name[0]?.toUpperCase() ?? '?'}
          </Text>
        )}
      </View>
    );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={close} style={{ marginRight: 12, padding: 4 }}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600' }}>Enviar contacto a</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>{contact.name}</Text>
          </View>
        </View>

        {/* Búsqueda */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 12 }}>
            <Ionicons name="search" size={18} color={colors.inputPlaceholder} />
            <TextInput
              style={{ flex: 1, color: colors.inputText, paddingVertical: 10, paddingHorizontal: 8, fontSize: 15 }}
              placeholder="Buscar un chat"
              placeholderTextColor={colors.inputPlaceholder}
              value={query}
              onChangeText={setQuery}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Lista */}
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.conv._id}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: selectedRows.length ? 120 : 24 }}
          ListEmptyComponent={
            <View style={{ paddingTop: 48, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                {query ? 'Ningún chat coincide' : 'No tienes chats todavía'}
              </Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => {
            const isSelected = selected.includes(item.conv._id);
            return (
              <TouchableOpacity
                onPress={() => toggle(item.conv._id)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}
              >
                <View>
                  {avatarFor(item.name, item.avatar, 48, item.isGroup)}
                  {isSelected && (
                    <View style={{ position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgPrimary }}>
                      <Ionicons name="checkmark" size={11} color="#fff" />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.conv.isFavorite && (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Favorito</Text>
                  )}
                </View>
                <View
                  style={{
                    width: 22, height: 22, borderRadius: 11,
                    borderWidth: isSelected ? 0 : 1.5,
                    borderColor: colors.border,
                    backgroundColor: isSelected ? colors.accent : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          }}
        />

        {/* Barra inferior: nombres elegidos + botón compartir */}
        {selectedRows.length > 0 && (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bgSecondary, borderTopWidth: 1, borderTopColor: colors.border }}>
            <SafeAreaView edges={['bottom']}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
                <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 14 }} numberOfLines={2}>
                  {selectedRows.map((r) => r.name).join(', ')}
                </Text>
                <TouchableOpacity
                  onPress={() => setConfirming(true)}
                  style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="send" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>
        )}

        {/* Confirmación: la tarjeta que se va a enviar */}
        <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }} onPress={() => setConfirming(false)}>
            <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 340, backgroundColor: colors.bgSecondary, borderRadius: 20, padding: 24 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 20, textAlign: 'center' }}>
                Compartir contacto
              </Text>

              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                {avatarFor(contact.name, contact.avatar, 88)}
                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>
                  {contact.name}
                </Text>
              </View>

              <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
                Se enviará a {selectedRows.length} chat{selectedRows.length !== 1 ? 's' : ''}
              </Text>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => setConfirming(false)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.bgTertiary, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSend}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Compartir</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}
