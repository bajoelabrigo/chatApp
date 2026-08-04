import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
  ActivityIndicator,
  Pressable,
  Alert,
  Animated,
  PanResponder,
  ScrollView,
  Dimensions,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { FontAwesome5, MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useChatsStore } from '../../src/store/useChatsStore';
import { useNotificationsStore } from '../../src/store/useNotificationsStore';
import { useTheme } from '../../src/context/ThemeContext';
import { ChatHeaderSection, type ChatFilterType } from '../../src/components/ChatHeaderSection';
import DailyPopup from '../../src/components/DailyPopup';
import { uploadFile } from '../../src/services/uploadService';
import { getSocket } from '../../src/services/socketService';
import {
  getConversations,
  createOrGetConversation,
  searchUsers,
  searchAllMessages,
  type MessageSearchHit,
  getSuggestedUsers,
  getAllUsers,
  apiTogglePin,
  apiToggleArchive,
  apiToggleFavorite,
  apiToggleBlock,
  apiToggleMute,
  apiSetUnread,
  apiClearConversation,
  apiDeleteConversation,
  markAllConversationsRead,
  discoverGroups,
  joinGroup,
  type Conversation,
  type ChatUser,
  type Message,
  type DiscoverableGroup,
} from '../../src/services/conversationService';
import { DiscoverGroups } from '../../src/components/chat/DiscoverGroups';
import { cld } from '../../src/lib/cldImage';

// Cuántos sugeridos ("Quizás los conozcas") se ven sin desplegar. El backend
// manda hasta 15; en filas verticales, pintarlos todos empujaría los CHATS —lo
// que el usuario viene a ver— por debajo de una pantalla de desconocidos.
const SUGGESTED_PREVIEW = 5;

function lastMsgPreview(conv: Conversation, currentUserId?: string): string {
  const lm = conv.lastMessage;
  if (!lm) return '';
  if (lm.isDeletedForEveryone) return '🚫 Mensaje eliminado';
  let content = '';
  // Con pie de foto se muestra el pie (como WhatsApp): dice más que "Imagen".
  if (lm.type === 'image') content = `📷 ${lm.caption ?? 'Imagen'}`;
  else if (lm.type === 'audio') content = '🎤 Nota de voz';
  else if (lm.type === 'video') content = `🎬 ${lm.caption ?? 'Video'}`;
  else if (lm.type === 'document') content = `📎 ${lm.caption ?? lm.fileName ?? 'Documento'}`;
  else if (lm.type === 'contact') content = `👤 ${lm.contact?.name ?? lm.content}`;
  else if (lm.type === 'poll') content = `📊 ${lm.poll?.question ?? lm.content}`;
  else if (lm.type === 'bible') content = `📖 ${lm.bible?.reference ?? lm.content}`;
  else content = lm.content;
  if (conv.isGroup && lm.senderId && typeof lm.senderId === 'object') {
    const isMe = lm.senderId._id === currentUserId;
    const prefix = isMe ? 'Tú' : (lm.senderId.name ?? 'Miembro');
    return `${prefix}: ${content}`;
  }
  return content;
}

function lastMsgTime(conv: Conversation): string {
  if (!conv.lastMessageAt) return '';
  return new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Regex tolerante a acentos (á=a, ñ=n…) para resaltar el término en el snippet,
// igual que la búsqueda del backend. Devuelve match con índices del texto ORIGINAL.
function buildAccentRegex(q: string): RegExp | null {
  const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const map: Record<string, string> = {
    a: '[aáàäâã]', e: '[eéèëê]', i: '[iíìïî]',
    o: '[oóòöôõ]', u: '[uúùüû]', n: '[nñ]', c: '[cç]',
  };
  const cleaned = stripAccents(q.trim());
  if (!cleaned) return null;
  const pattern = [...cleaned]
    .map((ch) => map[ch] ?? ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('');
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

// Snippet del mensaje con el término resaltado (estilo WhatsApp). Centra la ventana
// alrededor de la coincidencia si el texto es largo.
function MessageSnippet({ text, query, colors }: { text: string; query: string; colors: any }) {
  const rx = buildAccentRegex(query);
  const m = rx ? rx.exec(text) : null;
  if (!m) {
    return (
      <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 13 }}>
        {text}
      </Text>
    );
  }
  const idx = m.index;
  const matchLen = m[0].length;
  const start = Math.max(0, idx - 24);
  const prefix = start > 0 ? '…' : '';
  const before = text.slice(start, idx);
  const match = text.slice(idx, idx + matchLen);
  const after = text.slice(idx + matchLen);
  return (
    <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 13 }}>
      {prefix}{before}
      <Text style={{ color: colors.accent, fontWeight: '700' }}>{match}</Text>
      {after}
    </Text>
  );
}

// Un chat cuenta como "sin leer" si tiene mensajes pendientes de verdad o si el
// usuario lo marcó a mano (bandera `isUnreadMarked` del backend).
const hasUnread = (c: Conversation) => (c.unreadCount ?? 0) > 0 || !!c.isUnreadMarked;

export default function ChatsScreen() {
  const { token, user } = useAuthStore();
  const { colors } = useTheme();
  const {
    conversations, onlineUsers, typingUsers,
    setConversations, upsertConversation,
    pinConversation, archiveConversation, unarchiveConversation,
    favoriteConversation, blockConversation, unblockConversation, muteConversation,
    setConversationUnread,
    clearConversation: clearConversationMessages,
    removeConversation,
    addMessage,
  } = useChatsStore();
  const { unreadCount: notifCount, fetchNotifications: fetchNotifs } = useNotificationsStore();

  const [loading, setLoading] = useState(() => useChatsStore.getState().conversations.length === 0);
  const [showNewChatMenu, setShowNewChatMenu] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const activeSwipeClose = useRef<(() => void) | null>(null);

  const [actionConv, setActionConv] = useState<Conversation | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  const [listSearch, setListSearch] = useState('');
  // IDs de conversaciones que coinciden por CONTENIDO de mensaje (búsqueda global).
  const [msgMatchIds, setMsgMatchIds] = useState<Set<string>>(new Set());
  // Mensajes coincidentes (con snippet) para la sección "Mensajes" estilo WhatsApp.
  const [msgResults, setMsgResults] = useState<MessageSearchHit[]>([]);
  const [activeFilter, setActiveFilter] = useState<ChatFilterType>('all');

  const [showDotMenu, setShowDotMenu] = useState(false);
  const [showConvPicker, setShowConvPicker] = useState(false);
  const [pendingImage, setPendingImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [sendingImage, setSendingImage] = useState(false);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [suggestedUsers, setSuggestedUsers] = useState<ChatUser[]>([]);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [allUsersQuery, setAllUsersQuery] = useState('');
  const [allUsersResults, setAllUsersResults] = useState<ChatUser[]>([]);
  const [allUsersLoading, setAllUsersLoading] = useState(false);

  const exitSelectMode = () => { setIsSelectMode(false); setSelectedIds(new Set()); };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleArchiveSelected = async () => {
    if (!token || selectedIds.size === 0) return;
    for (const id of selectedIds) {
      try { await apiToggleArchive(token, id); archiveConversation(id); } catch { /* continue */ }
    }
    exitSelectMode();
  };

  const handleMarkSelectedRead = async () => {
    if (!token || selectedIds.size === 0) return;
    try { await markAllConversationsRead(token); const updated = await getConversations(token); setConversations(updated); } catch { /* ignore */ }
    exitSelectMode();
  };

  const handleArchiveItem = async (item: Conversation) => {
    if (!token) return;
    try {
      await apiToggleArchive(token, item._id);
      archiveConversation(item._id);
    } catch {
      Alert.alert('Error', 'No se pudo archivar el chat');
    }
  };

  const handleAllUsersSearch = useCallback(async (q: string) => {
    setAllUsersQuery(q);
    if (!token) return;
    setAllUsersLoading(true);
    try {
      const results = await getAllUsers(token, q);
      setAllUsersResults(results);
    } catch { /* ignore */ }
    finally { setAllUsersLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    getConversations(token)
      .then(setConversations)
      .catch(() => {})
      .finally(() => setLoading(false));
    getSuggestedUsers(token).then(setSuggestedUsers).catch(() => {});
    discoverGroups(token).then(setDiscoverable).catch(() => {});
  }, [token]);

  // ── Descubrir grupos ────────────────────────────────────────
  const [discoverable, setDiscoverable] = useState<DiscoverableGroup[]>([]);
  const [joiningGroup, setJoiningGroup] = useState<string | null>(null);

  const handleJoinGroup = async (g: DiscoverableGroup) => {
    if (!token) return;
    setJoiningGroup(g._id);
    try {
      const res: any = await joinGroup(token, g._id);

      // El grupo pide aprobación: la solicitud queda encolada y el admin decide.
      // Se marca como pendiente en la lista para que el botón deje de invitar.
      if (res?.pending) {
        setDiscoverable((prev) =>
          prev.map((x) => (x._id === g._id ? { ...x, requestPending: true } : x))
        );
        Alert.alert(
          'Solicitud enviada',
          `Un administrador de "${g.groupName}" revisará tu solicitud. Te avisaremos cuando te acepten.`
        );
        return;
      }

      // Grupo abierto: se entra al momento. Sale de "descubrir" y aparece en los
      // chats, así que se recarga la lista.
      setDiscoverable((prev) => prev.filter((x) => x._id !== g._id));
      const convs = await getConversations(token);
      setConversations(convs);
      Alert.alert('¡Ya estás dentro!', `Te uniste a "${g.groupName}".`);
    } catch {
      Alert.alert('Error', 'No se pudo enviar la solicitud.');
    } finally {
      setJoiningGroup(null);
    }
  };

  // Refrescar el badge de notificaciones cada vez que se enfoca el tab de chats.
  useFocusEffect(
    useCallback(() => {
      if (token) fetchNotifs(token);
    }, [token])
  );

  useEffect(() => {
    if (!showAllUsers || !token) return;
    setAllUsersLoading(true);
    getAllUsers(token, '').then(setAllUsersResults).catch(() => {}).finally(() => setAllUsersLoading(false));
  }, [showAllUsers]);


  const sortedConversations = useMemo(() => {
    // Fijados arriba; dentro de cada grupo, por el mensaje más reciente (los
    // usuarios con que me he comunicado primero, recientes arriba; los que nunca
    // tuvieron mensaje quedan al final).
    const lastActivity = (c: Conversation) =>
      new Date(c.lastMessageAt || c.lastMessage?.createdAt || 0).getTime();
    return [...conversations].sort((a, b) => {
      if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
      return lastActivity(b) - lastActivity(a);
    });
  }, [conversations]);

  // Búsqueda global por contenido de mensajes (debounced) cuando se escribe en
  // el buscador de la lista. Encuentra chats por palabra/mensaje, no solo nombre.
  useEffect(() => {
    const q = listSearch.trim();
    if (q.length < 2 || !token) {
      setMsgMatchIds(new Set());
      setMsgResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const results = await searchAllMessages(token, q);
        if (!cancelled) {
          setMsgResults(results);
          setMsgMatchIds(new Set(results.map((r) => r.conversationId)));
        }
      } catch {
        // sin conexión / error: se conserva el filtro por nombre
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [listSearch, token]);

  const filteredConversations = useMemo(() => {
    const getSenderId = (lm: NonNullable<Conversation['lastMessage']>): string => {
      const raw = lm.senderId as unknown;
      return typeof raw === 'string' ? raw : (raw as { _id: string })?._id ?? '';
    };

    let result = sortedConversations;

    if (activeFilter === 'unread') {
      result = result.filter((c) => {
        const lm = c.lastMessage;
        return !!lm && getSenderId(lm) !== user?.id && lm.status !== 'read';
      });
    } else if (activeFilter === 'favorites') {
      result = result.filter((c) => c.isFavorite === true);
    } else if (activeFilter === 'groups') {
      result = result.filter((c) => c.isGroup === true);
    }

    if (listSearch.trim().length > 0) {
      const q = listSearch.toLowerCase();
      result = result.filter((c) => {
        const name = c.isGroup
          ? (c.groupName ?? '').toLowerCase()
          : (c.participants.find((p) => p._id !== user?.id)?.name ?? '').toLowerCase();
        if (name.includes(q)) return true;
        // Coincidencia por el último mensaje (instantáneo)…
        const lm = c.lastMessage;
        if (lm?.type === 'text' && (lm.content ?? '').toLowerCase().includes(q)) return true;
        // …o por cualquier mensaje del historial (búsqueda global del backend).
        return msgMatchIds.has(c._id);
      });
    }

    return result;
  }, [sortedConversations, activeFilter, listSearch, user?.id, msgMatchIds]);

  const unreadCount = useMemo(() => {
    const getSenderId = (lm: NonNullable<Conversation['lastMessage']>): string => {
      const raw = lm.senderId as unknown;
      return typeof raw === 'string' ? raw : (raw as { _id: string })?._id ?? '';
    };
    return sortedConversations.filter((c) => {
      const lm = c.lastMessage;
      return !!lm && getSenderId(lm) !== user?.id && lm.status !== 'read';
    }).length;
  }, [sortedConversations, user?.id]);

  const favoritesCount = useMemo(() =>
    sortedConversations.filter((c) => c.isFavorite === true).length,
    [sortedConversations]);

  const groupsCount = useMemo(() =>
    sortedConversations.filter((c) => c.isGroup === true).length,
    [sortedConversations]);

  const handleMarkAllRead = async () => {
    setShowDotMenu(false);
    if (!token) return;
    try {
      await markAllConversationsRead(token);
      const updated = await getConversations(token);
      setConversations(updated);
    } catch {
      Alert.alert('Error', 'No se pudo marcar como leído');
    }
  };

  const handleCameraPress = () => {
    Alert.alert('Compartir imagen', 'Elige una opción', [
      { text: 'Tomar foto', onPress: () => pickAndShareImage('camera') },
      { text: 'Elegir de galería', onPress: () => pickAndShareImage('library') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const pickAndShareImage = async (source: 'camera' | 'library') => {
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Sin permiso', 'Permite acceso a la cámara en Ajustes.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({ quality: 0.2, mediaTypes: ['images'], allowsEditing: false });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Sin permiso', 'Permite acceso a la galería en Ajustes.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.2 });
    }
    if (result.canceled || !result.assets[0]) return;
    setPendingImage(result.assets[0]);
    setShowConvPicker(true);
  };

  const sendImageToConversation = async (conv: Conversation) => {
    if (!pendingImage || !token || !user) return;
    setShowConvPicker(false);
    setSendingImage(true);
    try {
      const asset = pendingImage;
      const fileName = asset.fileName ?? `photo_${Date.now()}.jpg`;
      const mime = asset.mimeType ?? 'image/jpeg';
      const uploaded = await uploadFile(token, asset.uri, mime, fileName);

      const socket = getSocket();
      if (!socket) {
        Alert.alert('Sin conexión', 'Verifica tu conexión a internet e intenta de nuevo.');
        return;
      }

      // Add optimistic message so it's visible the moment the chat screen opens
      const temp: Message = {
        _id: `temp_${Date.now()}`,
        conversationId: conv._id,
        senderId: { _id: user.id, name: user.name, email: user.email ?? '', avatar: user.avatar },
        content: uploaded.url,
        type: 'image',
        fileName: uploaded.originalName ?? fileName,
        fileSize: uploaded.size,
        status: 'sent',
        createdAt: new Date().toISOString(),
      };
      addMessage(temp);

      // Emit to server (will replace temp with real message via message:new)
      socket.emit('message:send', {
        conversationId: conv._id,
        content: uploaded.url,
        type: 'image',
        fileName: uploaded.originalName,
        fileSize: uploaded.size,
        cloudinaryPublicId: uploaded.publicId,
      });

      // Navigate immediately — optimistic message already visible in store
      setPendingImage(null);
      const other = conv.isGroup ? null : conv.participants.find((p) => p._id !== user.id);
      router.push({
        pathname: '/chat/[id]' as any,
        params: {
          id: conv._id,
          name: conv.isGroup ? (conv.groupName ?? 'Grupo') : (other?.name ?? ''),
          avatar: conv.isGroup ? (conv.groupAvatar ?? '') : (other?.avatar ?? ''),
          ...(conv.isGroup ? { isGroup: '1', memberCount: String(conv.participants.length) } : {}),
        },
      });
    } catch (err: any) {
      const detail = err?.response?.data?.error ?? err?.message ?? String(err);
      console.error('[sendImage]', detail, err);
      Alert.alert('Error al enviar imagen', detail || 'Intenta de nuevo');
    } finally {
      setSendingImage(false);
      setPendingImage(null);
    }
  };

  const runAction = async (fn: () => Promise<void>) => {
    setActionLoading(true);
    try { await fn(); }
    catch { Alert.alert('Error', 'No se pudo completar la acción'); }
    finally { setActionLoading(false); setActionConv(null); }
  };

  const handlePin = () => {
    if (!actionConv || !token) return;
    const next = !actionConv.isPinned;
    runAction(async () => {
      await apiTogglePin(token, actionConv._id);
      pinConversation(actionConv._id, next);
    });
  };

  const handleArchive = () => {
    if (!actionConv || !token) return;
    runAction(async () => {
      await apiToggleArchive(token, actionConv._id);
      archiveConversation(actionConv._id);
    });
  };

  const handleUnarchive = () => {
    if (!actionConv || !token) return;
    runAction(async () => {
      await apiToggleArchive(token, actionConv._id);
      unarchiveConversation(actionConv._id);
    });
  };

  const handleFavorite = () => {
    if (!actionConv || !token) return;
    const next = !actionConv.isFavorite;
    runAction(async () => {
      await apiToggleFavorite(token, actionConv._id);
      favoriteConversation(actionConv._id, next);
    });
  };

  const handleBlock = () => {
    if (!actionConv || !token) return;
    const other = actionConv.participants.find((p) => p._id !== user?.id);
    if (!other) return;
    Alert.alert(
      'Bloquear usuario',
      `¿Bloquear a ${other.name}? No podrá enviarte mensajes.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear', style: 'destructive',
          onPress: () => runAction(async () => {
            await apiToggleBlock(token, other._id);
            blockConversation(actionConv._id);
          }),
        },
      ]
    );
  };

  const handleUnblock = () => {
    if (!actionConv || !token) return;
    const other = actionConv.participants.find((p) => p._id !== user?.id);
    if (!other) return;
    runAction(async () => {
      await apiToggleBlock(token, other._id);
      unblockConversation(actionConv._id);
    });
  };

  const handleMute = () => {
    if (!actionConv || !token) return;
    const next = !actionConv.isMuted;
    runAction(async () => {
      await apiToggleMute(token, actionConv._id);
      muteConversation(actionConv._id, next);
    });
  };

  // Un chat "está sin leer" si tiene mensajes pendientes de verdad o si el
  // usuario lo marcó a mano. En ambos casos la acción que ofrecemos es la
  // contraria: marcarlo como leído.
  const handleToggleUnread = () => {
    if (!actionConv || !token) return;
    const next = !hasUnread(actionConv);
    runAction(async () => {
      await apiSetUnread(token, actionConv._id, next);
      setConversationUnread(actionConv._id, next);
    });
  };

  // Vaciar: borra los mensajes SOLO para mí; el chat se queda en la lista.
  const handleClearChat = () => {
    if (!actionConv || !token) return;
    const conv = actionConv;
    Alert.alert(
      '¿Vaciar el chat?',
      'Se borrarán los mensajes solo para ti. La otra persona conservará los suyos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Vaciar', style: 'destructive',
          onPress: () => runAction(async () => {
            await apiClearConversation(token, conv._id);
            clearConversationMessages(conv._id);
          }),
        },
      ]
    );
  };

  // Eliminar: vacía y saca el chat de mi lista. Reaparece si me vuelven a escribir.
  const handleDeleteChat = () => {
    if (!actionConv || !token) return;
    const conv = actionConv;
    Alert.alert(
      '¿Eliminar el chat?',
      'Se eliminará de tu lista y se borrarán sus mensajes solo para ti. Si te vuelven a escribir, el chat aparecerá de nuevo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: () => runAction(async () => {
            await apiDeleteConversation(token, conv._id);
            removeConversation(conv._id);
          }),
        },
      ]
    );
  };

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await searchUsers(token!, q);
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  }, [token]);

  const openOrCreateChat = async (targetUser: ChatUser) => {
    if (!token || creating) return;
    setCreating(true);
    try {
      const conv = await createOrGetConversation(token, targetUser._id);
      upsertConversation(conv);
      setShowNewChat(false);
      setShowAllUsers(false);
      setSearchQuery('');
      setSearchResults([]);
      router.push({
        pathname: '/chat/[id]' as any,
        params: { id: conv._id, name: targetUser.name, avatar: targetUser.avatar ?? '' },
      });
    } finally {
      setCreating(false);
    }
  };

  const openChat = (conv: Conversation) => {
    if (conv.isGroup) {
      router.push({
        pathname: '/chat/[id]' as any,
        params: {
          id: conv._id,
          name: conv.groupName ?? 'Grupo',
          avatar: conv.groupAvatar ?? '',
          isGroup: '1',
          memberCount: String(conv.participants.length),
        },
      });
      return;
    }
    const other = conv.participants.find((p) => p._id !== user?.id);
    if (!other) return;
    router.push({
      pathname: '/chat/[id]' as any,
      params: { id: conv._id, name: other.name, avatar: other.avatar ?? '' },
    });
  };

  // Abre la conversación de un resultado de búsqueda y navega al mensaje exacto,
  // que el chat resaltará (estilo WhatsApp).
  const openSearchMessage = (hit: MessageSearchHit) => {
    const c = hit.conversation;
    if (!c) return;
    setListSearch('');
    router.push({
      pathname: '/chat/[id]' as any,
      params: {
        id: c._id,
        name: c.name,
        avatar: c.avatar ?? '',
        ...(c.isGroup ? { isGroup: '1' } : {}),
        highlightMessageId: hit._id,
        highlightCreatedAt: hit.createdAt,
      },
    });
  };

  const ConvRow = ({
    item,
    isArchivedView = false,
  }: {
    item: Conversation;
    isArchivedView?: boolean;
  }) => {
    const isGroup = item.isGroup;
    const other = !isGroup ? item.participants.find((p) => p._id !== user?.id) : undefined;
    if (!isGroup && !other) return null;
    const isOnline = !isGroup && other ? onlineUsers.has(other._id) : false;
    const displayName = isGroup ? (item.groupName ?? 'Grupo') : other!.name;
    const displayAvatar = isGroup ? item.groupAvatar : other?.avatar;
    const isSelected = selectedIds.has(item._id);

    // Alguien escribiendo en este chat: sustituye la vista previa del último
    // mensaje. En grupos se nombra a quién escribe; en 1:1 el nombre sobra.
    const typingIds = typingUsers[item._id] ?? [];
    const typingLabel = typingIds.length === 0
      ? null
      : isGroup
        ? `${item.participants.find((p) => p._id === typingIds[0])?.name ?? 'Alguien'} está escribiendo…`
        : 'escribiendo…';

    return (
      <TouchableOpacity
        onPress={() => isSelectMode ? toggleSelect(item._id) : openChat(item)}
        onLongPress={() => isSelectMode ? toggleSelect(item._id) : setActionConv({ ...item, isArchived: isArchivedView || item.isArchived })}
        delayLongPress={400}
        style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border,
          backgroundColor: isSelected ? (colors.bgTertiary) : colors.bgSecondary,
        }}
        activeOpacity={0.7}
      >
        {/* Checkbox (select mode) */}
        {isSelectMode && (
          <View style={{
            width: 24, height: 24, borderRadius: 12,
            borderWidth: 2,
            borderColor: isSelected ? colors.accent : colors.textMuted,
            backgroundColor: isSelected ? colors.accent : 'transparent',
            alignItems: 'center', justifyContent: 'center',
            marginRight: 10,
          }}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}

        {/* Avatar */}
        <View style={{ position: 'relative', marginRight: 12 }}>
          {displayAvatar ? (
            <Image source={{ uri: cld(displayAvatar, 50) }} style={{ width: 50, height: 50, borderRadius: 12 }} />
          ) : (
            <View style={{ width: 50, height: 50, borderRadius: 12, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
              {isGroup ? (
                <FontAwesome5 name="user-friends" size={18} color={colors.accent} />
              ) : (
                <Text style={{ color: colors.accent, fontWeight: 'bold', fontSize: 18 }}>{displayName[0]?.toUpperCase()}</Text>
              )}
            </View>
          )}
          {isOnline && !item.isBlocked && !isSelectMode && (
            <View style={{ position: 'absolute', bottom: 0, right: 0, width: 13, height: 13, backgroundColor: colors.onlineDot, borderRadius: 7, borderWidth: 2, borderColor: colors.bgSecondary }} />
          )}
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, marginRight: 8 }}>
              {isGroup && <FontAwesome5 name="user-friends" size={11} color={colors.textMuted} />}
              <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 16 }} numberOfLines={1}>{displayName}</Text>
              {item.isFavorite && <Text style={{ color: '#FBBF24', fontSize: 12 }}>⭐</Text>}
              {item.isPinned && <Text style={{ color: colors.textMuted, fontSize: 12 }}>📌</Text>}
              {item.isBlocked && <Text style={{ color: colors.danger, fontSize: 11 }}> 🔒</Text>}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{lastMsgTime(item)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            {typingLabel ? (
              <Text style={{ color: colors.onlineDot, fontSize: 14, fontStyle: 'italic', flex: 1, marginRight: 8 }} numberOfLines={1}>
                {typingLabel}
              </Text>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 14, flex: 1, marginRight: 8 }} numberOfLines={1}>
                {lastMsgPreview(item, user?.id) || (isGroup ? `${item.participants.length} miembros` : 'Iniciar conversación')}
              </Text>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {item.isMuted && (
                <Ionicons name="volume-mute-outline" size={15} color={colors.textMuted} />
              )}
              {(item.unreadCount ?? 0) > 0 && (
                <View style={{
                  backgroundColor: item.isMuted ? colors.textMuted : colors.onlineDot,
                  borderRadius: 12, minWidth: 22, height: 22,
                  alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 5,
                }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                    {(item.unreadCount ?? 0) > 99 ? '99+' : item.unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const modalSheetStyle = {
    backgroundColor: colors.actionSheetBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.headerBg }} edges={['top']}>
      {isSelectMode ? (
        /* ── Select mode header ── */
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 14,
          borderBottomWidth: 1, borderBottomColor: colors.border,
          backgroundColor: colors.headerBg,
        }}>
          <TouchableOpacity onPress={exitSelectMode} style={{ marginRight: 12 }}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 17, flex: 1 }}>
            {selectedIds.size === 0 ? 'Seleccionar' : `${selectedIds.size} seleccionado${selectedIds.size !== 1 ? 's' : ''}`}
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (selectedIds.size === filteredConversations.length) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(filteredConversations.map((c) => c._id)));
              }
            }}
          >
            <Text style={{ color: colors.accent, fontSize: 14 }}>
              {selectedIds.size === filteredConversations.length ? 'Ninguno' : 'Todos'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ChatHeaderSection
          searchQuery={listSearch}
          onSearchChange={setListSearch}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          unreadCount={unreadCount}
          favoritesCount={favoritesCount}
          groupsCount={groupsCount}
          onMenuPress={() => setShowDotMenu(true)}
          onNewChatPress={() => setShowNewChatMenu(true)}
          onCameraPress={handleCameraPress}
          onNotificationsPress={() => router.push('/notifications' as any)}
          notificationsCount={notifCount}
        />
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          style={{ backgroundColor: colors.bgPrimary }}
          data={filteredConversations}
          keyExtractor={(item) => item._id}
          onScrollBeginDrag={() => { activeSwipeClose.current?.(); activeSwipeClose.current = null; }}
          renderItem={({ item }) => (
            <SwipeableRow
              onMore={() => setActionConv({ ...item })}
              onArchive={() => handleArchiveItem(item)}
              onOpen={(closeFn) => {
                if (activeSwipeClose.current && activeSwipeClose.current !== closeFn) {
                  activeSwipeClose.current();
                }
                activeSwipeClose.current = closeFn;
              }}
            >
              <ConvRow item={item} />
            </SwipeableRow>
          )}
          ListHeaderComponent={
            (
              <View>
                {/* Sección: Mensajes (resultados de búsqueda por contenido, estilo WhatsApp) */}
                {listSearch.trim().length >= 2 && msgResults.length > 0 && (
                  <View style={{ backgroundColor: colors.bgPrimary, borderBottomWidth: 1, borderBottomColor: colors.border, paddingTop: 8 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, marginBottom: 4 }}>
                      Mensajes
                    </Text>
                    {msgResults.map((hit) => {
                      const c = hit.conversation;
                      const isMedia = hit.type && hit.type !== 'text';
                      const preview = isMedia ? `📎 ${hit.fileName ?? 'Archivo'}` : (hit.content ?? '');
                      return (
                        <TouchableOpacity
                          key={hit._id}
                          onPress={() => openSearchMessage(hit)}
                          activeOpacity={0.7}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}
                        >
                          {c?.avatar ? (
                            <Image source={{ uri: cld(c.avatar, 46) }} style={{ width: 46, height: 46, borderRadius: 23, marginRight: 12 }} />
                          ) : (
                            <View style={{ width: 46, height: 46, borderRadius: 23, marginRight: 12, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: colors.accent, fontWeight: 'bold', fontSize: 18 }}>{(c?.name ?? '?')[0]?.toUpperCase()}</Text>
                            </View>
                          )}
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>
                              {c?.name ?? 'Conversación'}
                            </Text>
                            <View style={{ flexDirection: 'row' }}>
                              {hit.senderName ? (
                                <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13 }}>{hit.senderName}: </Text>
                              ) : null}
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <MessageSnippet text={preview} query={listSearch} colors={colors} />
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => router.navigate({ pathname: '/(tabs)/settings', params: { section: 'archivados' } } as any)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 12,
                    borderBottomWidth: 1, borderBottomColor: colors.border,
                    backgroundColor: colors.bgSecondary,
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{
                    width: 50, height: 50, borderRadius: 25,
                    backgroundColor: colors.bgTertiary,
                    marginRight: 12, alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="archive-outline" size={24} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>Archivados</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )
          }
          // "Quizás los conozcas" y "Descubre grupos" van DEBAJO de las
          // conversaciones, igual que en la web (Sidebar.jsx: <Conversations /> y
          // después <SuggestedUsers />). Estaban arriba y empujaban los chats —lo
          // que el usuario viene a ver— por debajo de una lista de desconocidos.
          ListFooterComponent={
            (
              <View>
                {/* Sección: Quizás los conozcas.
                    Filas verticales, como en el chat de la web (SuggestedUsers.jsx
                    → Contact.jsx). Antes era un carrusel horizontal de avatares con
                    el nombre de pila recortado: cabían pocos, no se leía quién era
                    cada uno y había que arrastrar para verlos. Una fila normal se
                    lee de un vistazo y es el mismo gesto que abrir un chat. */}
                {suggestedUsers.length > 0 && listSearch.trim().length < 2 && (
                  <View style={{ backgroundColor: colors.bgSecondary, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 4 }}>
                      <Text style={{ flex: 1, color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Quizás los conozcas
                      </Text>
                      <TouchableOpacity
                        onPress={() => setShowAllUsers(true)}
                        style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="add" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>

                    {/* Solo los primeros. En vertical ocupan mucho más que el
                        carrusel, y el backend manda hasta 15: pintarlos todos
                        empujaría los CHATS —lo que el usuario viene a ver— por
                        debajo de una pantalla entera de desconocidos. El resto
                        está a un toque, en "Ver todos". */}
                    {suggestedUsers.slice(0, SUGGESTED_PREVIEW).map((u) => {
                      const isOnline = onlineUsers.has(u._id);
                      return (
                        <TouchableOpacity
                          key={u._id}
                          onPress={() => openOrCreateChat(u)}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                          }}
                        >
                          <View>
                            {u.avatar ? (
                              <Image source={{ uri: cld(u.avatar, 50) }} style={{ width: 50, height: 50, borderRadius: 25 }} />
                            ) : (
                              <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: colors.accent, fontWeight: 'bold', fontSize: 20 }}>
                                  {u.name[0]?.toUpperCase()}
                                </Text>
                              </View>
                            )}
                            {/* Punto verde de "en línea", igual que en la lista de chats. */}
                            {isOnline && (
                              <View
                                style={{
                                  position: 'absolute', right: 0, bottom: 0,
                                  width: 14, height: 14, borderRadius: 7,
                                  backgroundColor: '#22c55e',
                                  borderWidth: 2, borderColor: colors.bgSecondary,
                                }}
                              />
                            )}
                          </View>

                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}>
                              {u.name}
                            </Text>
                            <Text style={{ color: isOnline ? '#22c55e' : colors.textMuted, fontSize: 13, marginTop: 2 }}>
                              {isOnline ? 'En línea' : 'Toca para escribirle'}
                            </Text>
                          </View>

                          <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
                        </TouchableOpacity>
                      );
                    })}

                    {suggestedUsers.length > SUGGESTED_PREVIEW && (
                      <TouchableOpacity
                        onPress={() => setShowAllUsers(true)}
                        style={{ paddingHorizontal: 16, paddingVertical: 10 }}
                      >
                        <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>
                          Ver todos ({suggestedUsers.length})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Grupos abiertos a los que se puede pedir entrar. Hasta ahora a un
                    grupo solo se entraba si un admin te metía o por un enlace: no
                    había forma de encontrarlos, y por eso no crecían. */}
                {listSearch.trim().length < 2 && (
                  <DiscoverGroups
                    groups={discoverable}
                    busyId={joiningGroup}
                    colors={colors}
                    onJoin={handleJoinGroup}
                  />
                )}

              </View>
            )
          }
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, marginTop: 64 }}>
              <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 16 }}>
                No tienes conversaciones aún.{'\n'}Toca el botón + para empezar un chat.
              </Text>
            </View>
          }
        />
      )}

      {/* Popup diario (materiales / oración / actividades) — flotante sobre la
          lista, encima de la barra de pestañas. Oculto en modo selección. */}
      {!isSelectMode && <DailyPopup />}

      {/* Modal: Acción de conversación */}
      <Modal visible={!!actionConv} transparent animationType="slide" onRequestClose={() => setActionConv(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setActionConv(null)}>
          <Pressable onPress={() => {}}>
            <SafeAreaView edges={['bottom']} style={modalSheetStyle}>
              <View style={{ paddingTop: 16, paddingBottom: 4 }}>
                {actionConv && (() => {
                  const isGroup = actionConv.isGroup;
                  const other = !isGroup ? actionConv.participants.find((p) => p._id !== user?.id) : undefined;
                  return (
                    <View style={{ paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
                        {isGroup ? 'Grupo' : 'Conversación con'}
                      </Text>
                      <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 16 }}>
                        {isGroup ? (actionConv.groupName ?? 'Grupo') : other?.name}
                      </Text>
                    </View>
                  );
                })()}

                {actionLoading && <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />}

                {!actionLoading && actionConv && (
                  <>
                    {!actionConv.isArchived && (
                      <>
                        <ActionItem
                          icon={hasUnread(actionConv) ? '📖' : '🔵'}
                          label={hasUnread(actionConv) ? 'Marcar como leído' : 'Marcar como no leído'}
                          onPress={handleToggleUnread}
                          colors={colors}
                        />
                        <ActionItem icon="📌" label={actionConv.isPinned ? 'Desfijar chat' : 'Fijar chat'} onPress={handlePin} colors={colors} />
                        <ActionItem icon="⭐" label={actionConv.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} onPress={handleFavorite} colors={colors} />
                        <ActionItem icon={actionConv.isMuted ? '🔔' : '🔕'} label={actionConv.isMuted ? 'Activar notificaciones' : 'Silenciar'} onPress={handleMute} colors={colors} />
                        <ActionItem icon="📂" label="Archivar chat" onPress={handleArchive} colors={colors} />
                        <ActionItem icon="🧹" label="Vaciar chat" onPress={handleClearChat} colors={colors} danger />
                        {!actionConv.isGroup && (
                          <>
                            {/* En un grupo no se puede eliminar el chat sin salir antes
                                (seguirían llegando mensajes y reaparecería al instante). */}
                            <ActionItem icon="🗑️" label="Eliminar chat" onPress={handleDeleteChat} colors={colors} danger />
                            <ActionItem icon="🚫" label="Bloquear usuario" onPress={handleBlock} colors={colors} danger />
                          </>
                        )}
                      </>
                    )}
                    {actionConv.isArchived && !actionConv.isBlocked && (
                      <>
                        <ActionItem
                          icon={hasUnread(actionConv) ? '📖' : '🔵'}
                          label={hasUnread(actionConv) ? 'Marcar como leído' : 'Marcar como no leído'}
                          onPress={handleToggleUnread}
                          colors={colors}
                        />
                        <ActionItem icon="⭐" label={actionConv.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} onPress={handleFavorite} colors={colors} />
                        <ActionItem icon={actionConv.isMuted ? '🔔' : '🔕'} label={actionConv.isMuted ? 'Activar notificaciones' : 'Silenciar'} onPress={handleMute} colors={colors} />
                        <ActionItem icon="📥" label="Desarchivar chat" onPress={handleUnarchive} colors={colors} />
                        <ActionItem icon="🧹" label="Vaciar chat" onPress={handleClearChat} colors={colors} danger />
                        {!actionConv.isGroup && (
                          <ActionItem icon="🗑️" label="Eliminar chat" onPress={handleDeleteChat} colors={colors} danger />
                        )}
                      </>
                    )}
                    {actionConv.isBlocked && (
                      <ActionItem icon="🔓" label="Desbloquear usuario" onPress={handleUnblock} colors={colors} accent />
                    )}
                  </>
                )}

                <TouchableOpacity
                  onPress={() => setActionConv(null)}
                  style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Menú nuevo */}
      <Modal visible={showNewChatMenu} transparent animationType="fade" onRequestClose={() => setShowNewChatMenu(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setShowNewChatMenu(false)}>
          <Pressable onPress={() => {}}>
            <SafeAreaView edges={['bottom']} style={modalSheetStyle}>
              <View style={{ paddingTop: 20, paddingBottom: 8, paddingHorizontal: 16 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  Nueva conversación
                </Text>

                <TouchableOpacity
                  onPress={() => { setShowNewChatMenu(false); setShowNewChat(true); }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                    <Text style={{ fontSize: 20 }}>💬</Text>
                  </View>
                  <View>
                    <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}>Nuevo chat</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>Conversación privada 1 a 1</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => { setShowNewChatMenu(false); router.push('/new-group' as any); }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}
                >
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                    <MaterialIcons name="group-add" size={22} color={colors.accent} />
                  </View>
                  <View>
                    <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}>Nuevo grupo</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>Conversación con varias personas</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setShowNewChatMenu(false)}
                  style={{ marginTop: 12, marginBottom: 4, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Nuevo chat */}
      <Modal visible={showNewChat} animationType="slide" onRequestClose={() => setShowNewChat(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.headerBg }}>
            <TouchableOpacity
              onPress={() => { setShowNewChat(false); setSearchQuery(''); setSearchResults([]); }}
              style={{ marginRight: 12 }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 22 }}>✕</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600' }}>Nuevo chat</Text>
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <TextInput
              style={{ backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }}
              placeholder="Buscar por nombre o email..."
              placeholderTextColor={colors.inputPlaceholder}
              value={searchQuery}
              onChangeText={handleSearch}
              autoFocus
            />
          </View>
          {searching ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
          ) : (
            <FlatList
              style={{ backgroundColor: colors.bgPrimary }}
              data={searchResults}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => openOrCreateChat(item)}
                  disabled={creating}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  {item.avatar ? (
                    <Image source={{ uri: cld(item.avatar, 44) }} style={{ width: 44, height: 44, borderRadius: 10, marginRight: 12 }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.avatarBg, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: colors.accent, fontWeight: 'bold' }}>{item.name[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View>
                    <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{item.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{item.email}</Text>
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={
                searchQuery.length >= 2 ? (
                  <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 32 }}>Sin resultados</Text>
                ) : null
              }
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Modal: Menú tres puntos */}
      <Modal visible={showDotMenu} transparent animationType="fade" onRequestClose={() => setShowDotMenu(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setShowDotMenu(false)}>
          <View style={{
            position: 'absolute', top: 64, left: 16,
            backgroundColor: colors.bgSecondary,
            borderRadius: 14, overflow: 'hidden',
            minWidth: 180,
            shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
          }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 15 }}
              onPress={() => { setShowDotMenu(false); setIsSelectMode(true); }}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.textPrimary} style={{ marginRight: 12 }} />
              <Text style={{ color: colors.textPrimary, fontSize: 15 }}>Seleccionar</Text>
            </TouchableOpacity>
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 15 }}
              onPress={handleMarkAllRead}
            >
              <Ionicons name="checkmark-done-outline" size={20} color={colors.textPrimary} style={{ marginRight: 12 }} />
              <Text style={{ color: colors.textPrimary, fontSize: 15 }}>Leer todo</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Modal: Selector de conversación para compartir imagen */}
      <Modal visible={showConvPicker} animationType="slide" onRequestClose={() => { setShowConvPicker(false); setPendingImage(null); }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.headerBg }}>
            <TouchableOpacity onPress={() => { setShowConvPicker(false); setPendingImage(null); }} style={{ marginRight: 12 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 22 }}>✕</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600' }}>Compartir con...</Text>
          </View>
          {pendingImage && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Image source={{ uri: pendingImage.uri }} style={{ width: 64, height: 64, borderRadius: 10 }} />
            </View>
          )}
          {sendingImage ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.accent} />
              <Text style={{ color: colors.textMuted, marginTop: 12 }}>Enviando imagen...</Text>
            </View>
          ) : (
            <FlatList
              style={{ backgroundColor: colors.bgPrimary }}
              data={sortedConversations}
              keyExtractor={(c) => c._id}
              renderItem={({ item }) => {
                const isGroup = item.isGroup;
                const other = !isGroup ? item.participants.find((p) => p._id !== user?.id) : undefined;
                const displayName = isGroup ? (item.groupName ?? 'Grupo') : (other?.name ?? '');
                const displayAvatar = isGroup ? item.groupAvatar : other?.avatar;
                return (
                  <TouchableOpacity
                    onPress={() => sendImageToConversation(item)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  >
                    {displayAvatar ? (
                      <Image source={{ uri: cld(displayAvatar, 46) }} style={{ width: 46, height: 46, borderRadius: 10, marginRight: 12 }} />
                    ) : (
                      <View style={{ width: 46, height: 46, borderRadius: 10, backgroundColor: colors.avatarBg, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: colors.accent, fontWeight: 'bold', fontSize: 17 }}>{displayName[0]?.toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>{displayName}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Modal: Todos los usuarios */}
      <Modal visible={showAllUsers} animationType="slide" onRequestClose={() => { setShowAllUsers(false); setAllUsersQuery(''); }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.headerBg }}>
            <TouchableOpacity
              onPress={() => { setShowAllUsers(false); setAllUsersQuery(''); }}
              style={{ marginRight: 12 }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 22 }}>✕</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600' }}>Usuarios</Text>
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <TextInput
              style={{ backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }}
              placeholder="Buscar por nombre..."
              placeholderTextColor={colors.inputPlaceholder}
              value={allUsersQuery}
              onChangeText={handleAllUsersSearch}
              autoFocus={false}
            />
          </View>
          {allUsersLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
          ) : (
            <FlatList
              style={{ backgroundColor: colors.bgPrimary }}
              data={allUsersResults}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => openOrCreateChat(item)}
                  disabled={creating}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  {item.avatar ? (
                    <Image source={{ uri: cld(item.avatar, 46) }} style={{ width: 46, height: 46, borderRadius: 10, marginRight: 12 }} />
                  ) : (
                    <View style={{ width: 46, height: 46, borderRadius: 10, backgroundColor: colors.avatarBg, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: colors.accent, fontWeight: 'bold', fontSize: 18 }}>{item.name[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>{item.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.email}</Text>
                  </View>
                  <Ionicons name="chatbubble-outline" size={18} color={colors.accent} />
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 32 }}>No hay usuarios</Text>
              }
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Select mode bottom action bar */}
      {isSelectMode && selectedIds.size > 0 && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          flexDirection: 'row',
          backgroundColor: colors.bgSecondary,
          borderTopWidth: 1, borderTopColor: colors.border,
          paddingBottom: 24, paddingTop: 12,
          paddingHorizontal: 16,
          gap: 12,
        }}>
          <TouchableOpacity
            onPress={handleMarkSelectedRead}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.bgTertiary }}
          >
            <Ionicons name="checkmark-done-outline" size={18} color={colors.accent} />
            <Text style={{ color: colors.accent, fontWeight: '600' }}>Leer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleArchiveSelected}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.bgTertiary }}
          >
            <Ionicons name="archive-outline" size={18} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Archivar</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

function ActionItem({ icon, label, onPress, colors, danger, accent }: {
  icon: string; label: string; onPress: () => void;
  colors: any; danger?: boolean; accent?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <Text style={{ fontSize: 20, marginRight: 16 }}>{icon}</Text>
      <Text style={{ fontSize: 16, color: danger ? colors.danger : accent ? colors.accent : colors.textPrimary }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const SWIPE_ACTION_WIDTH = 148;
const SWIPE_SNAP_THRESHOLD = 40;

function SwipeableRow({ children, onMore, onArchive, onOpen }: {
  children: React.ReactNode;
  onMore: () => void;
  onArchive: () => void;
  onOpen?: (closeFn: () => void) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);
  const [overlay, setOverlay] = useState(false);

  const close = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    isOpen.current = false;
    setOverlay(false);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10,
      onPanResponderMove: (_, { dx }) => {
        const base = isOpen.current ? -SWIPE_ACTION_WIDTH : 0;
        translateX.setValue(Math.min(0, Math.max(base + dx, -SWIPE_ACTION_WIDTH)));
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const base = isOpen.current ? -SWIPE_ACTION_WIDTH : 0;
        const finalDx = base + dx;
        if (finalDx < -SWIPE_SNAP_THRESHOLD || vx < -0.5) {
          Animated.spring(translateX, { toValue: -SWIPE_ACTION_WIDTH, useNativeDriver: true, bounciness: 0 }).start();
          isOpen.current = true;
          setOverlay(true);
          onOpen?.(close);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
          isOpen.current = false;
          setOverlay(false);
        }
      },
    })
  ).current;

  return (
    <View style={{ overflow: 'hidden', width: SCREEN_WIDTH }}>
      <Animated.View
        style={{ flexDirection: 'row', transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {/* Contenido principal */}
        <View style={{ width: SCREEN_WIDTH }}>
          {/* Overlay transparente: captura toques sobre el contenido cuando está abierto */}
          {overlay && (
            <Pressable
              style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 10 }}
              onPress={close}
            />
          )}
          {children}
        </View>
        {/* Botones — fuera del área visible hasta que se desliza */}
        <View style={{
          width: SWIPE_ACTION_WIDTH,
          flexDirection: 'row',
          paddingVertical: 6,
          paddingRight: 6,
          gap: 6,
        }}>
          <TouchableOpacity
            onPress={() => { close(); onMore(); }}
            style={{ flex: 1, borderRadius: 12, backgroundColor: '#4B5563', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 11, marginTop: 3, fontWeight: '500' }}>Más</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { close(); onArchive(); }}
            style={{ flex: 1, borderRadius: 12, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="archive-outline" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 11, marginTop: 3, fontWeight: '500' }}>Archivar</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}
