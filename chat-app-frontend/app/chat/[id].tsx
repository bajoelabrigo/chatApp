import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  ImageBackground,
  Keyboard,
  Modal,
  Pressable,
  Alert,
  Share,
  Linking,
  Animated,
  Easing,
  PanResponder,
} from 'react-native';

const CHAT_BG_LIGHT = require('../../assets/chat-bg-light.png');
const CHAT_BG_DARK = require('../../assets/chat-bg-dark.png');
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Feather, FontAwesome5, Ionicons } from '@expo/vector-icons';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useChatsStore } from '../../src/store/useChatsStore';
import { useCallStore } from '../../src/store/useCallStore';
import { useTheme } from '../../src/context/ThemeContext';
import { getSocket } from '../../src/services/socketService';
import GroupPendingBar from '../../src/components/GroupPendingBar';
import { GroupCommunityBar } from '../../src/components/chat/GroupCommunityBar';
import { DailyVerseChatCard } from '../../src/components/chat/DailyVerseChatCard';
import { fetchGroupDailyVerse, reactGroupDailyVerse, type GroupDailyVerse } from '../../src/services/bibleService';
import { CreatePollModal } from '../../src/components/chat/CreatePollModal';
import { PollVotersModal } from '../../src/components/chat/PollVotersModal';
import { useMentions } from '../../src/hooks/useMentions';
import { getGroupSummary, type GroupSummary } from '../../src/services/activityService';
import {
  getMessages,
  createOrGetConversation,
  toggleGroupAdmin,
  removeGroupMember,
  apiToggleMute,
} from '../../src/services/conversationService';
import { uploadFile } from '../../src/services/uploadService';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import BibleModal from '../../src/components/chat/BibleModal';
import type { Message, ChatUser, SharedContact } from '../../src/services/conversationService';
// Helpers puros (agrupar por día, etiquetas de fecha, iconos) y piezas visuales de
// la lista. Vivían aquí dentro; la pantalla ya solo orquesta.
import {
  docIconFor,
  formatDateLabel,
  buildListData,
  type ListItem,
} from '../../src/utils/chatList';
import {
  DateSeparator,
  TypingIndicator,
  SwipeableMessage,
} from '../../src/components/chat/ChatListParts';
import { useVoiceRecorder } from '../../src/hooks/useVoiceRecorder';
import { GroupMemberSheet } from '../../src/components/chat/GroupMemberSheet';
import { cld } from '../../src/lib/cldImage';

const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🙏'];

function BouncingEmoji({
  emoji, delay, isSelected, onPress, colors,
}: {
  emoji: string; delay: number; isSelected: boolean;
  onPress: (e: string) => void; colors: any;
}) {
  const y = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, { toValue: -6, duration: 480, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 480, useNativeDriver: true }),
        Animated.delay(300),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.5, useNativeDriver: true, damping: 5, stiffness: 300 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 200 }),
    ]).start();
    onPress(emoji);
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.75}>
      <Animated.View style={{
        transform: [{ translateY: y }, { scale }],
        width: 46, height: 46,
        borderRadius: 23,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: isSelected ? colors.accent + '22' : 'transparent',
        borderWidth: isSelected ? 1.5 : 0,
        borderColor: colors.accent,
      }}>
        <Text style={{ fontSize: 28 }}>{emoji}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const TYPING_DEBOUNCE = 1500;

export default function ChatScreen() {
  const { id: conversationId, name, avatar, isGroup, memberCount, highlightMessageId, highlightCreatedAt } = useLocalSearchParams<{
    id: string;
    name: string;
    avatar?: string;
    isGroup?: string;
    memberCount?: string;
    highlightMessageId?: string;
    highlightCreatedAt?: string;
  }>();
  const isGroupChat = isGroup === '1';

  const insets = useSafeAreaInsets();
  const { token, user } = useAuthStore();
  const { colors, isDark } = useTheme();
  const { messages, typingUsers, onlineUsers, setMessages, prependMessages, addMessage, conversations, upsertConversation, muteConversation, resetUnreadCount } =
    useChatsStore();
  const { startCall, callState } = useCallStore();

  const otherParticipant = useMemo(() => {
    const conv = conversations.find((c) => c._id === conversationId);
    return conv?.participants.find((p) => p._id !== user?.id);
  }, [conversations, conversationId, user?.id]);

  const [text, setText] = useState('');

  const [loading, setLoading] = useState(() => {
    const cached = useChatsStore.getState().messages[conversationId];
    return !cached || cached.length === 0;
  });
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  // Encuestas (solo grupos). Las funciones que las envían y votan viven más abajo,
  // detrás de `socket`.
  const [pollOpen, setPollOpen] = useState(false);
  const [bibleOpen, setBibleOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // CRUD
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  // Selección múltiple (borrar varios a la vez, estilo WhatsApp)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionMode = selectedIds.size > 0;
  const [reactionDetail, setReactionDetail] = useState<{ messageId: string; filterEmoji: string } | null>(null);
  // "Ver votos": se guarda el ID, no la encuesta, para que el detalle se repinte
  // solo cuando llegue un `poll:update` (los votos se ven en vivo estando dentro).
  const [pollDetailId, setPollDetailId] = useState<string | null>(null);
  const [reactionEmojiPickerOpen, setReactionEmojiPickerOpen] = useState(false);
  const [memberModal, setMemberModal] = useState<ChatUser | null>(null);
  const [memberActionLoading, setMemberActionLoading] = useState(false);

  const flatListRef = useRef<FlatList<ListItem>>(null);
  const inputRef = useRef<TextInput>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTyping = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);
  const isInitialLoad = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // Mensaje a resaltar al venir del buscador global (estilo WhatsApp).
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightHandled = useRef(false);

  // ── Floating date badge ────────────────────────────────
  const [floatingDate, setFloatingDate] = useState('');
  const floatOpacity = useRef(new Animated.Value(0)).current;
  const floatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floatLabelRef = useRef('');

  const showFloating = useCallback((label: string) => {
    if (floatLabelRef.current !== label) {
      floatLabelRef.current = label;
      setFloatingDate(label);
    }
    Animated.timing(floatOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    if (floatTimer.current) clearTimeout(floatTimer.current);
    floatTimer.current = setTimeout(() => {
      Animated.timing(floatOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    }, 1500);
  }, [floatOpacity]);

  const showFloatingRef = useRef(showFloating);
  useEffect(() => { showFloatingRef.current = showFloating; }, [showFloating]);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!viewableItems.length) return;
    const first = viewableItems[0].item as ListItem;
    const label = first.kind === 'separator'
      ? first.label
      : formatDateLabel((first as { kind: 'message'; data: Message }).data.createdAt);
    showFloatingRef.current(label);
  });
  // ──────────────────────────────────────────────────────

  const conversationMessages = messages[conversationId] ?? [];
  const listData = useMemo(() => buildListData(conversationMessages), [conversationMessages]);

  // Al tocar la cita de un mensaje respondido: desplaza y resalta el mensaje
  // original (si sigue cargado en la lista).
  const jumpToMessage = useCallback((messageId?: string) => {
    if (!messageId) return;
    const idx = listData.findIndex(
      (it) => it.kind === 'message' && it.data._id === messageId
    );
    if (idx < 0) return; // el original no está cargado (mensaje muy antiguo)
    flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    setHighlightedId(messageId);
    setTimeout(() => setHighlightedId(null), 2000);
  }, [listData]);

  const socket = getSocket();
  // DEBUG — eliminar después del diagnóstico
  if (__DEV__) console.log('[socket] connected=', socket?.connected, 'exists=', !!socket);

  // ── Encuestas (solo grupos) ─────────────────────────────────
  //
  // Nacen de lo que los grupos ya hacen a mano: coordinar ayunos, vigilias y
  // escalas de oración contando mensajes ("¿quién puede el jueves de 6 a 7?").
  const sendPoll = (poll: { question: string; options: string[]; multiple: boolean }) => {
    if (!socket) return;
    setPollOpen(false);
    // NO se pinta optimista, al revés que un mensaje de texto: al servidor le toca
    // NORMALIZAR la encuesta (recorta opciones, descarta vacías) y el voto va
    // contra el `_id` real del mensaje. Una copia local llevaría a votar sobre un
    // mensaje que todavía no existe.
    socket.emit('message:send', {
      conversationId,
      content: poll.question, // vista previa en la lista de chats y en el push
      type: 'poll',
      poll,
    });
  };

  const votePoll = useCallback(
    (msg: Message, optionIndex: number) => {
      socket?.emit('poll:vote', { messageId: msg._id, conversationId, optionIndex });
    },
    [socket, conversationId]
  );

  // Cerrar la votación: deja de admitir votos. Sin esto, el autor cuadraba los
  // turnos y la gente seguía votando y moviéndoselos. El backend comprueba que
  // quien cierra sea el autor o un admin del grupo.
  const closePoll = useCallback(
    (msg: Message) => {
      Alert.alert(
        'Cerrar votación',
        'Nadie podrá votar ni cambiar su voto. Los resultados se quedan como están.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Cerrar',
            style: 'destructive',
            onPress: () => socket?.emit('poll:close', { messageId: msg._id, conversationId }),
          },
        ]
      );
    },
    [socket, conversationId]
  );

  const reactionDetailMessage = useMemo(() => {
    if (!reactionDetail) return null;
    return conversationMessages.find((m) => m._id === reactionDetail.messageId) ?? null;
  }, [reactionDetail, conversationMessages]);

  const pollDetailMessage = useMemo(() => {
    if (!pollDetailId) return null;
    return conversationMessages.find((m) => m._id === pollDetailId) ?? null;
  }, [pollDetailId, conversationMessages]);

  const openPollDetail = useCallback((msg: Message) => setPollDetailId(msg._id), []);

  const participantMap = useMemo(() => {
    const conv = conversations.find((c) => c._id === conversationId);
    const map = new Map<string, { name: string; avatar?: string }>();
    if (user) map.set(user.id, { name: user.name, avatar: user.avatar });
    conv?.participants.forEach((p) => map.set(p._id, { name: p.name, avatar: p.avatar }));
    return map;
  }, [conversations, conversationId, user]);

  const currentConv = useMemo(
    () => conversations.find((c) => c._id === conversationId),
    [conversations, conversationId],
  );
  const iAmAdmin = useMemo(
    () => currentConv?.admins?.includes(user?.id ?? '') ?? false,
    [currentConv, user?.id],
  );
  const isMuted = currentConv?.isMuted ?? false;

  // Lo que hay abierto en el grupo (actividades y peticiones), para la franja de
  // debajo de la cabecera. Se pide al abrir el chat y al volver a él: si acabas de
  // apuntarte a una actividad, la franja debe dejar de insistirte.
  const [groupSummary, setGroupSummary] = useState<GroupSummary | null>(null);
  // Versículo del día del grupo (tarjeta fija con reacciones compartidas).
  const [dailyVerse, setDailyVerse] = useState<GroupDailyVerse | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token || !isGroupChat) return;
      getGroupSummary(token, conversationId).then(setGroupSummary);
      fetchGroupDailyVerse(token, conversationId).then(setDailyVerse);
    }, [token, isGroupChat, conversationId])
  );

  // Reacción al versículo del día en tiempo real (otro miembro reaccionó).
  useEffect(() => {
    if (!socket) return;
    const onReact = (payload: { groupId: string; reactions: any[] }) => {
      if (payload.groupId !== conversationId) return;
      setDailyVerse((prev) =>
        prev
          ? { ...prev, reactions: payload.reactions, myEmoji: payload.reactions.find((r) => r.userId === user?.id)?.emoji ?? null }
          : prev
      );
    };
    socket.on('daily-verse:react', onReact);
    return () => { socket.off('daily-verse:react', onReact); };
  }, [socket, conversationId, user?.id]);

  const handleDailyVerseReact = async (emoji: string) => {
    if (!token || !dailyVerse) return;
    // Optimista: alterna mi reacción al instante.
    setDailyVerse((prev) => {
      if (!prev) return prev;
      const others = prev.reactions.filter((r) => r.userId !== user?.id);
      const toggledOff = prev.myEmoji === emoji;
      const mine = toggledOff
        ? []
        : [{ userId: user?.id ?? '', name: user?.name ?? 'Tú', avatar: user?.avatar ?? null, emoji }];
      return { ...prev, reactions: [...others, ...mine], myEmoji: toggledOff ? null : emoji };
    });
    const res = await reactGroupDailyVerse(token, conversationId, emoji);
    if (res) setDailyVerse((prev) => (prev ? { ...prev, reactions: res.reactions, myEmoji: res.myEmoji } : prev));
  };

  const handleDailyVerseOpen = () => {
    if (!dailyVerse) return;
    const v = dailyVerse.verse;
    router.navigate({
      pathname: '/(tabs)/bible',
      params: { openRef: `${v.book}|${v.chapter}|${v.verse}`, refVersion: v.version },
    } as any);
  };

  // ── Lectura en vivo (guiada por anfitrión) ──────────────────
  // Banner de "unirse" cuando hay una sesión activa en el grupo.
  const [liveReading, setLiveReading] = useState<{ count: number } | null>(null);

  useEffect(() => {
    if (!socket || !isGroupChat) return;
    socket.emit('reading:status', { groupId: conversationId });
    const upd = (p: any) => {
      if (p.groupId !== conversationId) return;
      setLiveReading(p.active === false ? null : { count: p.count ?? 1 });
    };
    const onEnded = (p: any) => { if (p.groupId === conversationId) setLiveReading(null); };
    socket.on('reading:status', upd);
    socket.on('reading:started', upd);
    socket.on('reading:presence', upd);
    socket.on('reading:ended', onEnded);
    return () => {
      socket.off('reading:status', upd);
      socket.off('reading:started', upd);
      socket.off('reading:presence', upd);
      socket.off('reading:ended', onEnded);
    };
  }, [socket, isGroupChat, conversationId]);

  const joinLiveReading = () => {
    router.push({ pathname: '/live-reading/[id]', params: { id: conversationId, host: '0' } } as any);
  };

  const handleToggleMute = async () => {
    if (!token) return;
    try {
      const { muted } = await apiToggleMute(token, conversationId);
      muteConversation(conversationId, muted);
    } catch {
      Alert.alert('Error', 'No se pudo silenciar la conversación');
    }
  };

  // ── Handlers: modal de miembro en grupo ───────────────────
  const handleMemberMessage = async () => {
    if (!memberModal || !token) return;
    setMemberActionLoading(true);
    try {
      const conv = await createOrGetConversation(token, memberModal._id);
      setMemberModal(null);
      router.push({
        pathname: '/chat/[id]' as any,
        params: { id: conv._id, name: memberModal.name, avatar: memberModal.avatar ?? '' },
      });
    } catch {
      Alert.alert('Error', 'No se pudo abrir la conversación');
    } finally {
      setMemberActionLoading(false);
    }
  };

  const handleMemberCall = async (callType: 'audio' | 'video') => {
    if (!memberModal || !token) return;
    setMemberActionLoading(true);
    try {
      const conv = await createOrGetConversation(token, memberModal._id);
      setMemberModal(null);
      if (callState === 'idle') {
        startCall({ peerId: memberModal._id, peerName: memberModal.name, peerAvatar: memberModal.avatar, conversationId: conv._id, callType });
      }
    } catch {
      Alert.alert('Error', 'No se pudo iniciar la llamada');
    } finally {
      setMemberActionLoading(false);
    }
  };

  const handleToggleMemberAdmin = async () => {
    if (!memberModal || !token || !currentConv) return;
    const isCurrentlyAdmin = currentConv.admins?.includes(memberModal._id) ?? false;
    setMemberActionLoading(true);
    try {
      const { isAdmin } = await toggleGroupAdmin(token, conversationId, memberModal._id);
      const newAdmins = isAdmin
        ? [...(currentConv.admins ?? []), memberModal._id]
        : (currentConv.admins ?? []).filter((a) => a !== memberModal._id);
      upsertConversation({ ...currentConv, admins: newAdmins });
      setMemberModal(null);
    } catch {
      Alert.alert('Error', isCurrentlyAdmin ? 'No se pudo quitar el rol de admin' : 'No se pudo asignar admin');
    } finally {
      setMemberActionLoading(false);
    }
  };

  const handleRemoveMember = () => {
    if (!memberModal || !token || !currentConv) return;
    Alert.alert(
      'Quitar del grupo',
      `¿Quitar a ${memberModal.name} del grupo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar', style: 'destructive',
          onPress: async () => {
            setMemberActionLoading(true);
            try {
              await removeGroupMember(token, conversationId, memberModal._id);
              const newParticipants = currentConv.participants.filter((p) => p._id !== memberModal._id);
              const newAdmins = (currentConv.admins ?? []).filter((a) => a !== memberModal._id);
              upsertConversation({ ...currentConv, participants: newParticipants, admins: newAdmins });
              setMemberModal(null);
            } catch {
              Alert.alert('Error', 'No se pudo quitar al miembro');
            } finally {
              setMemberActionLoading(false);
            }
          },
        },
      ]
    );
  };
  // ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token || !conversationId) return;
    resetUnreadCount(conversationId);
    socket?.emit('conversation:join', { conversationId });
    setLoadError(false);
    getMessages(token, conversationId)
      .then((msgs) => {
        console.log('[chat] getMessages OK:', msgs.length, 'msgs, convId=', conversationId, 'isGroup=', isGroup);
        setMessages(conversationId, msgs);
        setHasMore(msgs.length === 50);
      })
      .catch((err) => {
        console.error('[chat] getMessages error:', err?.response?.status, err?.message, 'convId=', conversationId);
        const hasCached = (useChatsStore.getState().messages[conversationId]?.length ?? 0) > 0;
        if (!hasCached) setLoadError(true);
      })
      .finally(() => setLoading(false));
    socket?.emit('message:read', { conversationId });
    return () => {
      stopTyping();
      stopRecording(true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, token, socket]);

  useEffect(() => {
    if (conversationMessages.length === 0) return;
    const lastId = conversationMessages[conversationMessages.length - 1]._id;
    if (lastId === lastMessageIdRef.current) return;
    lastMessageIdRef.current = lastId;

    resetUnreadCount(conversationId);

    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      // Si venimos del buscador con un mensaje a resaltar, NO bajar al fondo: el
      // efecto de highlight hará scroll al mensaje exacto.
      if (!highlightMessageId) {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      }
    } else {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [conversationMessages]);

  // Scroll al fondo cuando alguien empieza a escribir
  useEffect(() => {
    const typing = typingUsers[conversationId]?.filter((id) => id !== user?.id) ?? [];
    if (typing.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [typingUsers, conversationId, user?.id]);

  const loadMore = useCallback(async () => {
    if (!token || loadingMore || !hasMore || conversationMessages.length === 0) return;
    setLoadingMore(true);
    const oldest = conversationMessages[0];
    try {
      const older = await getMessages(token, conversationId, oldest.createdAt);
      prependMessages(conversationId, older);
      setHasMore(older.length === 50);
    } finally {
      setLoadingMore(false);
    }
  }, [token, loadingMore, hasMore, conversationMessages, conversationId]);

  // Al venir del buscador global: cargar (si hace falta) y hacer scroll + resaltar
  // el mensaje exacto. Carga páginas más viejas hasta encontrarlo (cap de seguridad).
  useEffect(() => {
    if (!highlightMessageId || highlightHandled.current || loading || !token) return;
    let cancelled = false;

    const run = async () => {
      for (let i = 0; i < 15 && !cancelled; i++) {
        const msgs = useChatsStore.getState().messages[conversationId] ?? [];
        const idx = buildListData(msgs).findIndex(
          (it) => it.kind === 'message' && it.data._id === highlightMessageId
        );
        if (idx !== -1) {
          highlightHandled.current = true;
          isInitialLoad.current = false;
          setHighlightedId(highlightMessageId);
          setTimeout(() => {
            try {
              flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
            } catch {}
          }, 200);
          setTimeout(() => setHighlightedId(null), 2800);
          return;
        }
        const oldest = msgs[0];
        // Ya cargamos más atrás que el target y no apareció → no está disponible.
        if (oldest && highlightCreatedAt &&
            new Date(oldest.createdAt).getTime() <= new Date(highlightCreatedAt).getTime()) {
          return;
        }
        if (msgs.length === 0) return;
        const before = msgs.length;
        try {
          const older = await getMessages(token, conversationId, oldest.createdAt);
          if (older.length) prependMessages(conversationId, older);
        } catch {
          return;
        }
        const after = (useChatsStore.getState().messages[conversationId] ?? []).length;
        if (after === before) return; // no hay más páginas
      }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, highlightMessageId]);

  // ── Typing ──────────────────────────────────────────────
  const stopTyping = () => {
    if (isTyping.current) {
      socket?.emit('typing:stop', { conversationId });
      isTyping.current = false;
    }
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
  };

  // Menciones (@nombre). Todo el estado y las reglas viven en `useMentions`; aquí
  // solo se enchufa al input.
  const mentions = useMentions(isGroupChat, currentConv?.participants, user?.id);

  const pickMention = (u: { _id: string; name: string; avatar?: string }) => {
    const next = mentions.pick(text, u);
    if (next) setText(next.text);
  };

  const handleChangeText = (value: string) => {
    setText(value);

    // El cursor todavía no se ha movido cuando llega este evento, así que se
    // supone al final de lo escrito. Es exacto al teclear (el caso normal); si el
    // usuario edita en medio, `onSelectionChange` lo corrige justo después.
    mentions.update(value, value.length);

    if (!isTyping.current) {
      socket?.emit('typing:start', { conversationId });
      isTyping.current = true;
    }
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(stopTyping, TYPING_DEBOUNCE);
  };

  // ── Enviar mensaje de texto ─────────────────────────────
  const sendMessage = () => {
    const content = text.trim();
    if (!content || !socket || !user) return;
    stopTyping();

    if (editingMessage) {
      console.log('[edit] emitting messageId=', editingMessage._id, 'socket connected=', socket?.connected);
      socket.emit('message:edit', { messageId: editingMessage._id, conversationId, content });
      setEditingMessage(null);
      setText('');
      return;
    }

    const temp: Message = {
      _id: `temp_${Date.now()}`,
      conversationId,
      senderId: { _id: user.id, name: user.name, email: user.email ?? '', avatar: user.avatar },
      content,
      type: 'text',
      status: 'sent',
      createdAt: new Date().toISOString(),
      replyTo: replyingTo ? {
        messageId: replyingTo._id,
        senderName: replyingTo.senderId.name,
        senderAvatar: replyingTo.senderId.avatar,
        content: replyingTo.content,
        type: replyingTo.type,
        fileName: replyingTo.fileName,
      } : undefined,
    };
    addMessage(temp);
    socket.emit('message:send', {
      conversationId,
      content,
      type: 'text',
      replyToMessageId: replyingTo?._id,
      // Se recalculan sobre el texto FINAL, no se van apuntando al elegirlos: el
      // usuario pudo borrar el "@Pedro" después de escribirlo, y avisar a Pedro de
      // un mensaje donde ya no aparece sería desconcertante.
      mentions: mentions.resolve(content),
    });
    setText('');
    mentions.close();
    setReplyingTo(null);
  };

  // ── Enviar pasaje bíblico (tipo 'bible') ────────────────
  // Se manda estructurado (referencia + versículos), no como texto: la burbuja lo
  // pinta como tarjeta con "Abrir en la Biblia". El `content` es la referencia,
  // para que las vistas previas funcionen sin leer `bible`.
  const sendBibleMessage = (passage: import('../../src/services/conversationService').SharedBible) => {
    if (!socket || !user) return;
    const reply = replyingTo;
    const temp: Message = {
      _id: `temp_${Date.now()}`,
      conversationId,
      senderId: { _id: user.id, name: user.name, email: user.email ?? '', avatar: user.avatar },
      content: passage.reference,
      type: 'bible',
      bible: passage,
      status: 'sent',
      createdAt: new Date().toISOString(),
      replyTo: reply ? {
        messageId: reply._id,
        senderName: reply.senderId.name,
        senderAvatar: reply.senderId.avatar,
        content: reply.content,
        type: reply.type,
        fileName: reply.fileName,
      } : undefined,
    };
    addMessage(temp);
    socket.emit('message:send', {
      conversationId,
      content: passage.reference,
      type: 'bible',
      bible: passage,
      replyToMessageId: reply?._id,
    });
    setReplyingTo(null);
    setBibleOpen(false);
  };

  // ── Enviar archivo (imagen / documento / audio) ─────────
  const sendFileMessage = async (
    fileUri: string,
    mimeType: string,
    fileName: string,
    messageType: 'image' | 'audio' | 'video' | 'document'
  ) => {
    if (!token || !socket || !user) return;
    setUploading(true);
    try {
      const result = await uploadFile(token, fileUri, mimeType, fileName);

      // El tipo lo decide el SERVIDOR a partir del mimetype real: por el selector
      // de documentos se puede elegir un .mp4, y mandarlo como 'document' lo
      // dejaría sin reproductor. `messageType` es solo el respaldo.
      const finalType = result.messageType ?? messageType;

      // Si se está respondiendo a un mensaje, la cita se adjunta al archivo
      // (como en WhatsApp: la foto/audio/doc lleva la respuesta).
      const reply = replyingTo;
      const temp: Message = {
        _id: `temp_${Date.now()}`,
        conversationId,
        senderId: { _id: user.id, name: user.name, email: user.email ?? '', avatar: user.avatar },
        content: result.url,
        type: finalType,
        fileName: result.originalName,
        fileSize: result.size,
        status: 'sent',
        createdAt: new Date().toISOString(),
        replyTo: reply ? {
          messageId: reply._id,
          senderName: reply.senderId.name,
          senderAvatar: reply.senderId.avatar,
          content: reply.content,
          type: reply.type,
          fileName: reply.fileName,
        } : undefined,
      };
      addMessage(temp);

      socket.emit('message:send', {
        conversationId,
        content: result.url,
        type: finalType,
        fileName: result.originalName,
        fileSize: result.size,
        cloudinaryPublicId: result.publicId,
        replyToMessageId: reply?._id,
      });
      if (reply) setReplyingTo(null);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'No se pudo enviar el archivo');
    } finally {
      setUploading(false);
    }
  };

  // ── Picker de imágenes ──────────────────────────────────
  const pickFromGallery = async () => {
    setAttachOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso denegado', 'Activa el acceso a la galería en Ajustes.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    const mime = asset.mimeType ?? 'image/jpeg';
    const fileName = uri.split('/').pop() ?? 'photo.jpg';
    await sendFileMessage(uri, mime, fileName, 'image');
  };

  const pickFromCamera = async () => {
    setAttachOpen(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso denegado', 'Activa el acceso a la cámara en Ajustes.'); return; }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    const mime = asset.mimeType ?? 'image/jpeg';
    const fileName = uri.split('/').pop() ?? 'photo.jpg';
    await sendFileMessage(uri, mime, fileName, 'image');
  };

  // ── Picker de documentos ────────────────────────────────
  const pickDocument = async () => {
    setAttachOpen(false);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    await sendFileMessage(asset.uri, asset.mimeType ?? 'application/octet-stream', asset.name, 'document');
  };

  // ── Grabación de voz ────────────────────────────────────
  //
  // La lógica (permisos, temporizadores, medidor de volumen, limpieza al salir)
  // vive en `useVoiceRecorder`. Aquí solo se dice qué hacer con lo grabado.
  const {
    isRecording,
    seconds: recordSeconds,
    bars: recordBars,
    start: startRecording,
    stop: stopRecording,
  } = useVoiceRecorder({
    onRecorded: (uri, mime, name) => sendFileMessage(uri, mime, name, "audio"),
  });

  // ── Descarga y compartir ────────────────────────────────
  const handleDownload = useCallback((msg: Message) => {
    // Abre la URL — en Android el navegador descarga automáticamente
    Linking.openURL(msg.content);
  }, []);

  const handleShare = async (msg: Message) => {
    setActionMessage(null);
    if (msg.type === 'text') {
      await Share.share({ message: msg.content });
    } else {
      await Share.share({
        message: msg.fileName ?? 'Archivo',
        url: msg.content,
        title: msg.fileName,
      });
    }
  };

  // ── CRUD ────────────────────────────────────────────────
  const cancelEdit = () => { setEditingMessage(null); setText(''); stopTyping(); };
  const cancelReply = () => setReplyingTo(null);

  const handleReact = (emoji: string) => {
    const msg = actionMessage;
    setActionMessage(null);
    if (!msg || !socket) {
      console.log('[react] BLOCKED msg=', !!msg, 'socket=', !!socket);
      return;
    }
    console.log('[react] emitting messageId=', msg._id, 'emoji=', emoji);
    socket.emit('message:react', { messageId: msg._id, conversationId, emoji });
  };

  const handleReactFromBubble = useCallback((msg: Message, emoji: string) => {
    socket?.emit('message:react', { messageId: msg._id, conversationId, emoji });
  }, [socket, conversationId]);

  const handleOpenReactionDetail = useCallback((msg: Message, emoji: string) => {
    setReactionDetail({ messageId: msg._id, filterEmoji: emoji });
  }, []);

  const handleChangeReaction = (newEmoji: string) => {
    if (!reactionDetail || !socket) return;
    const myCurrentEmoji = reactionDetailMessage?.reactions
      ?.find((r) => r.users.includes(user?.id ?? ''))?.emoji;
    if (newEmoji === myCurrentEmoji) return;
    socket.emit('message:react', { messageId: reactionDetail.messageId, conversationId, emoji: newEmoji });
    setReactionDetail((prev) => prev ? { ...prev, filterEmoji: newEmoji } : null);
    setReactionEmojiPickerOpen(false);
  };

  const handleRemoveReaction = () => {
    if (!reactionDetail || !socket) return;
    const myCurrentEmoji = reactionDetailMessage?.reactions
      ?.find((r) => r.users.includes(user?.id ?? ''))?.emoji;
    if (!myCurrentEmoji) return;
    socket.emit('message:react', { messageId: reactionDetail.messageId, conversationId, emoji: myCurrentEmoji });
    setReactionDetail(null);
  };

  const handleReactionEmojiSelect = (emojiType: EmojiType) => {
    handleChangeReaction(emojiType.emoji);
  };

  const handleReply = () => {
    if (!actionMessage) return;
    setReplyingTo(actionMessage);
    setActionMessage(null);
    setEditingMessage(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleLongPress = useCallback((msg: Message) => setActionMessage(msg), []);

  // Callbacks estables para las burbujas (memoizadas): evitan recrear funciones
  // en cada render del chat, lo que anularía el React.memo de MessageBubble.
  const handleAvatarPress = useCallback((sender: ChatUser) => setMemberModal(sender), []);

  // Botón "Mensaje" de una tarjeta de contacto compartido: abre (o crea) el chat
  // 1:1 con esa persona, igual que el deep link chatapp://u/<id>.
  // "Abrir en la Biblia" de un pasaje compartido: abre la pestaña Biblia en esa
  // referencia (y versión). El handler debe ir en useCallback o se anula el memo
  // de MessageBubble.
  const handleBiblePress = useCallback((bible: NonNullable<Message['bible']>) => {
    router.navigate({
      pathname: '/(tabs)/bible',
      params: {
        openRef: `${bible.book}|${bible.chapter}|${bible.verse}`,
        refVersion: bible.version,
      },
    } as any);
  }, []);

  const handleContactPress = useCallback(
    async (contact: SharedContact) => {
      if (!token) return;
      if (contact.userId === user?.id) {
        Alert.alert('Eres tú', 'Este es tu propio contacto.');
        return;
      }
      try {
        const conv = await createOrGetConversation(token, contact.userId);
        upsertConversation(conv);
        router.push({
          pathname: '/chat/[id]' as any,
          params: { id: conv._id, name: contact.name, avatar: contact.avatar ?? '' },
        });
      } catch {
        Alert.alert('Error', 'No se pudo abrir la conversación');
      }
    },
    [token, user?.id, upsertConversation]
  );
  const handleCallBack = useCallback((msg: Message) => {
    if (!otherParticipant || callState !== 'idle') return;
    startCall({
      peerId: otherParticipant._id,
      peerName: otherParticipant.name,
      peerAvatar: otherParticipant.avatar,
      conversationId,
      callType: msg.callType ?? 'audio',
    });
  }, [otherParticipant, callState, startCall, conversationId]);

  const handleEdit = () => {
    if (!actionMessage) return;
    setEditingMessage(actionMessage);
    setText(actionMessage.content);
    setActionMessage(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleDeleteForMe = () => {
    if (!actionMessage || !socket) return;
    socket.emit('message:delete', { messageId: actionMessage._id, conversationId, deleteFor: 'me' });
    setActionMessage(null);
  };

  const handleDeleteForEveryone = () => {
    if (!actionMessage || !socket) return;
    socket.emit('message:delete', { messageId: actionMessage._id, conversationId, deleteFor: 'everyone' });
    setActionMessage(null);
  };

  // ── Helpers ─────────────────────────────────────────────
  const isMine = (msg: Message) => msg.senderId._id === user?.id;
  const isOnline = onlineUsers.has(Array.from(onlineUsers).find((id) => id !== user?.id) ?? '');

  // ── Selección múltiple ──────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const enterSelectionMode = () => {
    if (!actionMessage) return;
    setSelectedIds(new Set([actionMessage._id]));
    setActionMessage(null);
  };
  const bulkDelete = (scope: 'me' | 'everyone') => {
    if (!socket) return;
    selectedIds.forEach((id) =>
      socket.emit('message:delete', { messageId: id, conversationId, deleteFor: scope })
    );
    setSelectedIds(new Set());
  };
  const confirmBulkDelete = () => {
    if (selectedIds.size === 0) return;
    const sel = conversationMessages.filter((m) => selectedIds.has(m._id));
    const allMine =
      sel.length > 0 && sel.every((m) => isMine(m) && !m.isDeletedForEveryone);
    const buttons: any[] = [
      { text: 'Eliminar para mí', onPress: () => bulkDelete('me') },
    ];
    if (allMine)
      buttons.push({
        text: 'Eliminar para todos',
        style: 'destructive',
        onPress: () => bulkDelete('everyone'),
      });
    buttons.push({ text: 'Cancelar', style: 'cancel' });
    Alert.alert(`Eliminar ${selectedIds.size} mensaje(s)`, undefined, buttons);
  };
  const typingList = typingUsers[conversationId]?.filter((id) => id !== user?.id) ?? [];

  const handleEmojiSelect = (emoji: EmojiType) => setText((prev) => prev + emoji.emoji);
  const toggleEmojiPicker = () => {
    if (emojiOpen) { setEmojiOpen(false); inputRef.current?.focus(); }
    else { Keyboard.dismiss(); setEmojiOpen(true); }
  };

  const showMicOrSend = !text.trim();

  const sheetStyle = {
    paddingBottom: insets.bottom + 8,
    backgroundColor: colors.actionSheetBg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 16,
  };

  const sheetRowStyle = {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.headerBg }}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      {/* Header — sin borde inferior para que el fondo llene hasta arriba sin división */}
      <View style={{ paddingTop: insets.top, backgroundColor: colors.headerBg }}>
        {/* Row 1: action buttons */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2, gap: 8 }}>
          {isGroupChat && (
            <>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/group-prayer/[id]' as any, params: { id: conversationId } })}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <FontAwesome5 name="praying-hands" size={14} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/group-activities/[id]' as any, params: { id: conversationId } })}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center' }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="flame" size={16} color="#fff" />
              </TouchableOpacity>

              {/* Plan de lectura del grupo. Junto a los otros dos: son las tres
                  cosas que un grupo hace además de hablar. */}
              <TouchableOpacity
                onPress={() =>
                  router.navigate({ pathname: '/(tabs)/bible', params: { section: 'plans', groupId: conversationId } } as any)
                }
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="book" size={16} color="#fff" />
              </TouchableOpacity>
            </>
          )}
          {!isGroupChat && otherParticipant && (
            <>
              <TouchableOpacity
                onPress={() => callState === 'idle' && startCall({ peerId: otherParticipant._id, peerName: otherParticipant.name, peerAvatar: otherParticipant.avatar, conversationId, callType: 'audio' })}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="call" size={16} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => callState === 'idle' && startCall({ peerId: otherParticipant._id, peerName: otherParticipant.name, peerAvatar: otherParticipant.avatar, conversationId, callType: 'video' })}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center' }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="videocam" size={16} color="#fff" />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            onPress={handleToggleMute}
            style={{
              width: 34, height: 34, borderRadius: 17,
              backgroundColor: isMuted ? colors.bgTertiary : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name={isMuted ? 'notifications-off' : 'notifications-outline'} size={17} color={isMuted ? colors.textMuted : colors.textSecondary} />
          </TouchableOpacity>
          {uploading && <ActivityIndicator color={colors.accent} size="small" />}
        </View>

        {/* Row 2: back + avatar + name */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 4, paddingBottom: 10 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 10, padding: 4 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 24 }}>←</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            activeOpacity={0.7}
            onPress={() => {
              if (isGroupChat) {
                router.push({ pathname: '/group-profile/[id]' as any, params: { id: conversationId } });
              } else if (otherParticipant) {
                router.push({ pathname: '/contact/[id]' as any, params: { id: otherParticipant._id, conversationId } });
              }
            }}
          >
            {avatar ? (
              <Image source={{ uri: cld(avatar, 40) }} style={{ width: 40, height: 40, borderRadius: 10, marginRight: 10 }} />
            ) : (
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.avatarBg, marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                {isGroupChat ? (
                  <FontAwesome5 name="user-friends" size={16} color={colors.accent} />
                ) : (
                  <Text style={{ color: colors.accent, fontWeight: 'bold' }}>{name?.[0]?.toUpperCase()}</Text>
                )}
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 16 }}>{name}</Text>
              {isGroupChat ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {memberCount ? `${memberCount} miembros` : 'Grupo'} · Toca para ver info
                </Text>
              ) : typingList.length > 0 ? (
                <Text style={{ color: colors.accent, fontSize: 12 }}>escribiendo...</Text>
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{isOnline ? 'en línea' : 'desconectado'}</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Solicitudes de ingreso pendientes (solo admins de grupos con aprobación previa) */}
      {isGroupChat && (
        <GroupPendingBar groupId={conversationId} token={token} isAdmin={iAmAdmin} />
      )}

      {/* Lo que hay abierto en el grupo (actividades y peticiones de oración).
          Antes solo se llegaba por dos iconos redondos de 34px sin etiqueta ni
          número en la cabecera: quien no supiera lo que eran, no los tocaba. */}
      {isGroupChat && groupSummary && (
        <GroupCommunityBar
          activities={groupSummary.activities}
          prayers={groupSummary.prayers}
          plan={groupSummary.plan}
          iParticipate={groupSummary.iParticipate}
          colors={colors}
          onOpenActivities={() =>
            router.push({ pathname: '/group-activities/[id]' as any, params: { id: conversationId } })
          }
          onOpenPrayers={() =>
            router.push({ pathname: '/group-prayer/[id]' as any, params: { id: conversationId } })
          }
          // El plan vive en la pestaña Biblia → Planes: se abre ahí directamente.
          // Sin esto, el chip diría "hay un plan" y dejaría al usuario buscándolo.
          onOpenPlan={() =>
            router.navigate({ pathname: '/(tabs)/bible', params: { section: 'plans', groupId: conversationId } } as any)
          }
        />
      )}

      {/* Lectura en vivo activa: banner para unirse. */}
      {isGroupChat && liveReading && (
        <TouchableOpacity
          onPress={joinLiveReading}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 14, paddingVertical: 10,
            backgroundColor: colors.accent,
          }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
          <Ionicons name="book" size={15} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, flex: 1 }} numberOfLines={1}>
            Lectura en vivo · {liveReading.count} {liveReading.count === 1 ? 'leyendo' : 'leyendo'}
          </Text>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Unirse</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Versículo del día del grupo: tarjeta fija con reacciones compartidas. */}
      {isGroupChat && dailyVerse && (
        <DailyVerseChatCard
          data={dailyVerse}
          colors={colors}
          onReact={handleDailyVerseReact}
          onOpen={handleDailyVerseOpen}
        />
      )}

      {/* Messages */}
      <ImageBackground
        source={isDark ? CHAT_BG_DARK : CHAT_BG_LIGHT}
        style={{ flex: 1 }}
        resizeMode="repeat"
      >
        <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(10,10,10,0.72)' : 'rgba(244,247,255,0.72)' }}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : loadError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 15, textAlign: 'center' }}>
            No se pudieron cargar los mensajes.{'\n'}Verifica tu conexión e intenta de nuevo.
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (!token || !conversationId) return;
              setLoading(true);
              setLoadError(false);
              getMessages(token, conversationId)
                .then((msgs) => { setMessages(conversationId, msgs); setHasMore(msgs.length === 50); })
                .catch((err) => { console.error('[chat] retry error:', err?.response?.status, err?.message); setLoadError(true); })
                .finally(() => setLoading(false));
            }}
            style={{ backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {selectionMode && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: colors.bgSecondary,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <TouchableOpacity onPress={() => setSelectedIds(new Set())} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={{ flex: 1, color: colors.textPrimary, fontWeight: '600', fontSize: 16 }}>
                {selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}
              </Text>
              <TouchableOpacity onPress={confirmBulkDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={22} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}
          <FlatList
            ref={flatListRef}
            style={{ backgroundColor: 'transparent' }}
            data={listData}
            keyExtractor={(item) => item.kind === 'separator' ? item.key : item.data._id}
            renderItem={({ item }) => {
              if (item.kind === 'separator') return <DateSeparator label={item.label} colors={colors} />;
              const bubble = (
                <MessageBubble
                  item={item.data}
                  isMine={isMine(item.data)}
                  currentUserId={user?.id ?? ''}
                  isGroup={isGroupChat}
                  // Para resaltar las menciones: TODOS los participantes, no los
                  // "mencionables" (que me excluyen a mí). En un mensaje ajeno que
                  // me menciona, el nombre a resaltar es justamente el mío.
                  mentionUsers={mentions.all}
                  onVote={votePoll}
                  onClosePoll={closePoll}
                  pollUsers={participantMap}
                  onPollDetail={openPollDetail}
                  highlighted={item.data._id === highlightedId}
                  onLongPress={handleLongPress}
                  onDownload={handleDownload}
                  onReact={handleReactFromBubble}
                  onReactDetail={handleOpenReactionDetail}
                  onAvatarPress={isGroupChat ? handleAvatarPress : undefined}
                  onCallBack={handleCallBack}
                  onContactPress={handleContactPress}
                  onBiblePress={handleBiblePress}
                  onReplyPress={jumpToMessage}
                />
              );
              if (selectionMode) {
                const selected = selectedIds.has(item.data._id);
                return (
                  <Pressable
                    onPress={() => toggleSelect(item.data._id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingLeft: 6,
                      backgroundColor: selected ? colors.bgTertiary : 'transparent',
                    }}
                  >
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                      color={selected ? colors.accent : colors.textMuted}
                      style={{ marginRight: 2 }}
                    />
                    <View style={{ flex: 1 }} pointerEvents="none">
                      {bubble}
                    </View>
                  </Pressable>
                );
              }
              if (item.data.isDeletedForEveryone) return bubble;
              return (
                <SwipeableMessage onSwipeRight={() => setReplyingTo(item.data)}>
                  {bubble}
                </SwipeableMessage>
              );
            }}
            extraData={selectedIds}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              if (contentOffset.y < 80) loadMore();
              const distFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
              setShowScrollBtn(distFromBottom > 150);
            }}
            scrollEventThrottle={100}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                try {
                  flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
                } catch {}
              }, 350);
            }}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onViewableItemsChanged={onViewableItemsChanged.current}
            viewabilityConfig={viewabilityConfig.current}
            ListHeaderComponent={
              loadingMore ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 8 }} /> : null
            }
            ListFooterComponent={
              typingList.length > 0 ? (
                <TypingIndicator
                  colors={colors}
                  avatar={otherParticipant?.avatar}
                  name={otherParticipant?.name ?? name}
                />
              ) : null
            }
            contentContainerStyle={{ paddingVertical: 8 }}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => { Keyboard.dismiss(); setEmojiOpen(false); }}
          />

          {/* Floating date badge */}
          <Animated.View
            pointerEvents="none"
            style={{ position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center', opacity: floatOpacity, zIndex: 10 }}
          >
            <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500' }}>{floatingDate}</Text>
            </View>
          </Animated.View>

          {/* Scroll-to-bottom button */}
          {showScrollBtn && (
            <TouchableOpacity
              onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
              activeOpacity={0.8}
              style={{
                position: 'absolute',
                bottom: 12,
                right: 14,
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: colors.bgSecondary,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.18,
                shadowRadius: 4,
                elevation: 5,
                zIndex: 20,
              }}
            >
              <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      )}
        </View>
      </ImageBackground>

      {/* Menciones: los miembros que encajan con lo que se lleva escrito tras la @.
          Va pegada al input (donde está mirando el usuario) y por encima de la
          barra de respuesta. */}
      {mentions.query && mentions.candidates.length > 0 && (
        <View
          style={{
            backgroundColor: colors.bgSecondary,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            maxHeight: 210,
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            {mentions.candidates.map((u) => (
              <TouchableOpacity
                key={u._id}
                onPress={() => pickMention(u)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  gap: 10,
                }}
              >
                {u.avatar ? (
                  <Image source={{ uri: cld(u.avatar, 34) }} style={{ width: 34, height: 34, borderRadius: 17 }} />
                ) : (
                  <View
                    style={{
                      width: 34, height: 34, borderRadius: 17,
                      backgroundColor: colors.avatarBg,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.accent, fontWeight: 'bold' }}>
                      {u.name[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>
                  {u.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Reply banner */}
      {replyingTo && !editingMessage && (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgSecondary, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.accent }}>
          <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: colors.accent, borderRadius: 2, marginRight: 10 }} />
          {replyingTo.type === 'image' && (
            <Image
              source={{ uri: cld(replyingTo.content, 44) }}
              style={{ width: 44, height: 44, borderRadius: 6, marginRight: 10 }}
              resizeMode="cover"
            />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>
              Respondiendo a {replyingTo.senderId.name}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
              {replyingTo.type === 'text'
                ? replyingTo.content
                : replyingTo.type === 'image' ? 'Imagen'
                : replyingTo.type === 'audio' ? '🎤 Nota de voz'
                : `📄 ${replyingTo.fileName ?? 'Documento'}`}
            </Text>
          </View>
          <TouchableOpacity onPress={cancelReply} style={{ marginLeft: 12, padding: 4 }}>
            <Text style={{ color: colors.textMuted, fontSize: 20 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Edit banner */}
      {editingMessage && (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgSecondary, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.accent }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>Editando mensaje</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>{editingMessage.content}</Text>
          </View>
          <TouchableOpacity onPress={cancelEdit} style={{ marginLeft: 12, padding: 4 }}>
            <Text style={{ color: colors.textMuted, fontSize: 20 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input bar */}
      <View style={{ paddingBottom: insets.bottom, backgroundColor: colors.bgSecondary, borderTopWidth: 1, borderTopColor: colors.border }}>
        {isRecording ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 10 }}>
            <TouchableOpacity onPress={() => stopRecording(true)} style={{ padding: 8 }}>
              <Text style={{ color: colors.danger, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />
              <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
              </Text>
            </View>
            {/* Medidor de volumen en vivo (las más nuevas a la derecha) */}
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, height: 32, overflow: 'hidden' }}>
              {recordBars.map((lvl, i) => (
                <View
                  key={i}
                  style={{ width: 2, borderRadius: 1, height: Math.max(3, lvl * 26), backgroundColor: colors.textMuted }}
                />
              ))}
            </View>
            <TouchableOpacity
              onPress={() => stopRecording(false)}
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: 20 }}>✓</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 8, gap: 6 }}>
            {/* + Adjuntar (fotos, documentos, biblia…) — igual que el botón "+" de la web */}
            <TouchableOpacity
              onPress={() => { setAttachOpen(true); Keyboard.dismiss(); setEmojiOpen(false); }}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="add" size={28} color={colors.accent} />
            </TouchableOpacity>

            {/* Emoji */}
            <TouchableOpacity
              onPress={toggleEmojiPicker}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
            >
              {emojiOpen
                ? <Ionicons name="text" size={22} color={colors.accent} />
                : <Ionicons name="happy" size={24} color={colors.accent} />}
            </TouchableOpacity>

            {/* Input */}
            <View style={{
              flex: 1, justifyContent: 'center',
              backgroundColor: colors.inputBg, borderRadius: 22,
              borderWidth: 1, borderColor: colors.border,
            }}>
              <TextInput
                ref={inputRef}
                style={{
                  color: colors.inputText,
                  paddingHorizontal: 14, paddingVertical: 10,
                  fontSize: 16, maxHeight: 112,
                }}
                placeholder="Escribe un mensaje"
                placeholderTextColor={colors.inputPlaceholder}
                value={text}
                onChangeText={handleChangeText}
                // Si el usuario mueve el cursor a mitad del texto, la mención se
                // recalcula desde ahí (al teclear basta con el final).
                onSelectionChange={(e) => mentions.update(text, e.nativeEvent.selection.start)}
                onFocus={() => setEmojiOpen(false)}
                multiline
              />
            </View>

            {/* A la derecha: micrófono cuando está vacío, enviar cuando hay texto */}
            {showMicOrSend ? (
              <TouchableOpacity
                onPress={startRecording}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
              >
                <Feather name="mic" size={19} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={sendMessage}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff', fontSize: 16 }}>{editingMessage ? '✓' : '➤'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Emoji Picker */}
      <EmojiPicker
        onEmojiSelected={handleEmojiSelect}
        open={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        theme={{
          backdrop: colors.bgPrimary + '99',
          knob: colors.accent,
          container: colors.bgSecondary,
          header: colors.accent,
          skinTonesContainer: colors.bgTertiary,
          category: {
            icon: colors.textMuted, iconActive: colors.accent,
            container: colors.bgSecondary, containerActive: colors.bgTertiary,
          },
          search: { background: colors.inputBg, text: colors.inputText, placeholder: colors.inputPlaceholder, icon: colors.textMuted },
          emoji: { selected: colors.bgTertiary },
        }}
        enableSearchBar
        enableRecentlyUsed
        categoryPosition="top"
      />

      {/* Emoji Picker para cambiar reacción */}
      <EmojiPicker
        onEmojiSelected={handleReactionEmojiSelect}
        open={reactionEmojiPickerOpen}
        onClose={() => setReactionEmojiPickerOpen(false)}
        theme={{
          backdrop: colors.bgPrimary + '99',
          knob: colors.accent,
          container: colors.bgSecondary,
          header: colors.accent,
          skinTonesContainer: colors.bgTertiary,
          category: {
            icon: colors.textMuted, iconActive: colors.accent,
            container: colors.bgSecondary, containerActive: colors.bgTertiary,
          },
          search: { background: colors.inputBg, text: colors.inputText, placeholder: colors.inputPlaceholder, icon: colors.textMuted },
          emoji: { selected: colors.bgTertiary },
        }}
        enableSearchBar
        enableRecentlyUsed
        categoryPosition="top"
      />

      {/* Modal adjuntos */}
      <Modal visible={attachOpen} transparent animationType="slide" onRequestClose={() => setAttachOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setAttachOpen(false)}>
          <Pressable onPress={() => {}}>
            <View style={sheetStyle}>
              <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', marginBottom: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>
                Adjuntar
              </Text>
              <TouchableOpacity onPress={pickFromCamera} style={sheetRowStyle}>
                <Text style={{ fontSize: 24, marginRight: 16 }}>📷</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Cámara</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={pickFromGallery} style={sheetRowStyle}>
                <Text style={{ fontSize: 24, marginRight: 16 }}>🖼️</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Galería</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={pickDocument} style={sheetRowStyle}>
                <Text style={{ fontSize: 24, marginRight: 16 }}>📄</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Documento</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setAttachOpen(false); setBibleOpen(true); setEmojiOpen(false); Keyboard.dismiss(); }}
                style={isGroupChat ? sheetRowStyle : { ...sheetRowStyle, borderBottomWidth: 0 }}
              >
                <Text style={{ fontSize: 24, marginRight: 16 }}>📖</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Biblia</Text>
              </TouchableOpacity>

              {/* Encuesta: solo en grupos. En un 1:1 no hay nada que votar. */}
              {isGroupChat && (
                <TouchableOpacity
                  onPress={() => { setAttachOpen(false); setPollOpen(true); setEmojiOpen(false); Keyboard.dismiss(); }}
                  style={{ ...sheetRowStyle, borderBottomWidth: 0 }}
                >
                  <Text style={{ fontSize: 24, marginRight: 16 }}>📊</Text>
                  <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Encuesta</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setAttachOpen(false)}
                style={{ marginHorizontal: 16, marginTop: 12, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center' }}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Crear encuesta. Se monta al abrirlo para que el formulario empiece en
          blanco (si no, arrastraría las opciones de la encuesta anterior). */}
      {pollOpen && (
        <CreatePollModal
          colors={colors}
          bottomInset={insets.bottom}
          onClose={() => setPollOpen(false)}
          onCreate={sendPoll}
        />
      )}

      {/* Modal acciones mensaje */}
      <Modal visible={!!actionMessage} transparent animationType="fade" onRequestClose={() => setActionMessage(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setActionMessage(null)}>
          <Pressable onPress={() => {}}>
            <View style={sheetStyle}>
              <View style={{ paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                  {actionMessage?.isDeletedForEveryone ? 'Mensaje eliminado' : actionMessage?.type === 'text' ? 'Mensaje' : actionMessage?.type === 'image' ? 'Imagen' : actionMessage?.type === 'audio' ? 'Nota de voz' : 'Documento'}
                </Text>
                <Text style={{ color: actionMessage?.isDeletedForEveryone ? colors.textMuted : colors.textPrimary, fontSize: 14, fontStyle: actionMessage?.isDeletedForEveryone ? 'italic' : 'normal' }} numberOfLines={2}>
                  {actionMessage?.isDeletedForEveryone
                    ? '🚫 Este mensaje fue eliminado para todos'
                    : actionMessage?.type === 'text'
                      ? actionMessage.content
                      : `${docIconFor(actionMessage?.type, actionMessage?.fileName)} ${actionMessage?.fileName ?? 'Archivo'}`}
                </Text>
                {!actionMessage?.isDeletedForEveryone && actionMessage?.type !== 'text' && (
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    De: {actionMessage && isMine(actionMessage) ? 'Tú' : actionMessage?.senderId.name}
                  </Text>
                )}
              </View>

              {!actionMessage?.isDeletedForEveryone && (
                <>
                  {/* Quick emoji reactions */}
                  <View style={{
                    flexDirection: 'row', justifyContent: 'space-around',
                    paddingHorizontal: 12, paddingVertical: 10,
                    borderBottomWidth: 1, borderBottomColor: colors.border,
                  }}>
                    {QUICK_EMOJIS.map((emoji, i) => (
                      <BouncingEmoji
                        key={emoji}
                        emoji={emoji}
                        delay={i * 90}
                        onPress={handleReact}
                        isSelected={!!actionMessage?.reactions?.find(
                          (r) => r.emoji === emoji && r.users.includes(user?.id ?? '')
                        )}
                        colors={colors}
                      />
                    ))}
                  </View>

                  <TouchableOpacity onPress={handleReply} style={sheetRowStyle}>
                    <Text style={{ fontSize: 22, marginRight: 16 }}>↩️</Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Responder</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={enterSelectionMode} style={sheetRowStyle}>
                    <Text style={{ fontSize: 22, marginRight: 16 }}>☑️</Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Seleccionar</Text>
                  </TouchableOpacity>

                  {actionMessage && isMine(actionMessage) && actionMessage.type === 'text' && (
                    <TouchableOpacity onPress={handleEdit} style={sheetRowStyle}>
                      <Text style={{ fontSize: 22, marginRight: 16 }}>✏️</Text>
                      <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Editar mensaje</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity onPress={() => actionMessage && handleShare(actionMessage)} style={sheetRowStyle}>
                    <Text style={{ fontSize: 22, marginRight: 16 }}>📤</Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Compartir</Text>
                  </TouchableOpacity>

                  {actionMessage && actionMessage.type !== 'text' && (
                    <TouchableOpacity onPress={() => { setActionMessage(null); actionMessage && handleDownload(actionMessage); }} style={sheetRowStyle}>
                      <Text style={{ fontSize: 22, marginRight: 16 }}>⬇️</Text>
                      <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Descargar</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              <TouchableOpacity onPress={handleDeleteForMe} style={sheetRowStyle}>
                <Text style={{ fontSize: 22, marginRight: 16 }}>🗑️</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Eliminar para mí</Text>
              </TouchableOpacity>

              {!actionMessage?.isDeletedForEveryone && actionMessage && isMine(actionMessage) && (
                <TouchableOpacity onPress={handleDeleteForEveryone} style={{ ...sheetRowStyle, borderBottomWidth: 0 }}>
                  <Text style={{ fontSize: 22, marginRight: 16 }}>❌</Text>
                  <Text style={{ color: colors.danger, fontSize: 16 }}>Eliminar para todos</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => setActionMessage(null)}
                style={{ marginHorizontal: 16, marginTop: 12, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center' }}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal detalle de reacción */}
      <Modal
        visible={!!reactionDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setReactionDetail(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
          onPress={() => setReactionDetail(null)}
        >
          <Pressable onPress={() => {}}>
            <View style={{
              backgroundColor: colors.actionSheetBg,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingBottom: insets.bottom + 8,
              maxHeight: 480,
            }}>
              {/* Drag handle */}
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>

              {/* Título: "X reacciones" */}
              {(() => {
                const total = reactionDetailMessage?.reactions?.reduce((s, r) => s + r.users.length, 0) ?? 0;
                return (
                  <Text style={{
                    textAlign: 'center', fontWeight: '700', fontSize: 17,
                    color: colors.textPrimary, marginTop: 6, marginBottom: 14,
                  }}>
                    {total} {total === 1 ? 'reacción' : 'reacciones'}
                  </Text>
                );
              })()}

              {/* Fila de filtros: botón "+" + pills por emoji */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 14 }}
              >
                {/* Botón añadir/cambiar reacción */}
                <TouchableOpacity
                  onPress={() => setReactionEmojiPickerOpen(true)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    height: 36, paddingHorizontal: 12, borderRadius: 18,
                    borderWidth: 1.5, borderColor: colors.border,
                    backgroundColor: colors.bgTertiary, gap: 2,
                  }}
                >
                  <Ionicons name="happy-outline" size={18} color={colors.textMuted} />
                  <Ionicons name="add" size={13} color={colors.textMuted} />
                </TouchableOpacity>

                {/* Pill por cada emoji con reacciones */}
                {reactionDetailMessage?.reactions?.map((r) => {
                  const isSelected = r.emoji === reactionDetail?.filterEmoji;
                  return (
                    <TouchableOpacity
                      key={r.emoji}
                      onPress={() => setReactionDetail((prev) => prev ? { ...prev, filterEmoji: r.emoji } : null)}
                      style={{
                        flexDirection: 'row', alignItems: 'center',
                        height: 36, paddingHorizontal: 14, borderRadius: 18,
                        borderWidth: 1.5,
                        borderColor: isSelected ? colors.accent : colors.border,
                        backgroundColor: isSelected ? colors.accent + '18' : colors.bgTertiary,
                        gap: 5,
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>{r.emoji}</Text>
                      {r.users.length > 1 && (
                        <Text style={{
                          fontSize: 14, fontWeight: '700',
                          color: isSelected ? colors.accent : colors.textPrimary,
                        }}>
                          {r.users.length}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 0 }} />

              {/* Lista de usuarios que reaccionaron con el emoji filtrado */}
              <ScrollView style={{ maxHeight: 280 }}>
                {(reactionDetailMessage?.reactions
                  ?.find((r) => r.emoji === reactionDetail?.filterEmoji)?.users ?? [])
                  .map((uid) => {
                    const isMe = uid === user?.id;
                    const info = participantMap.get(uid);
                    const displayName = isMe ? 'Tú' : (info?.name ?? 'Usuario');
                    const avatarUri = info?.avatar;
                    return (
                      <View
                        key={uid}
                        style={{
                          flexDirection: 'row', alignItems: 'center',
                          paddingHorizontal: 16, paddingVertical: 12,
                          borderBottomWidth: 1, borderBottomColor: colors.border,
                        }}
                      >
                        {/* Avatar */}
                        {avatarUri ? (
                          <Image
                            source={{ uri: cld(avatarUri, 46) }}
                            style={{ width: 46, height: 46, borderRadius: 23, marginRight: 12 }}
                          />
                        ) : (
                          <View style={{
                            width: 46, height: 46, borderRadius: 23,
                            backgroundColor: colors.avatarBg,
                            alignItems: 'center', justifyContent: 'center',
                            marginRight: 12,
                          }}>
                            <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '700' }}>
                              {displayName[0]?.toUpperCase() ?? '?'}
                            </Text>
                          </View>
                        )}

                        {/* Nombre + subtítulo */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>
                            {displayName}
                          </Text>
                          {isMe && (
                            <TouchableOpacity onPress={handleRemoveReaction} hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}>
                              <Text style={{ color: colors.accent, fontSize: 12, marginTop: 2 }}>
                                Toca para quitarla
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Emoji a la derecha */}
                        <Text style={{ fontSize: 26 }}>{reactionDetail?.filterEmoji}</Text>
                      </View>
                    );
                  })}
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Detalles de la encuesta: quién votó qué (se actualiza en vivo). */}
      <PollVotersModal
        visible={!!pollDetailMessage?.poll}
        poll={pollDetailMessage?.poll}
        users={participantMap}
        currentUserId={user?.id ?? ''}
        onClose={() => setPollDetailId(null)}
      />

      <BibleModal
        visible={bibleOpen}
        onClose={() => setBibleOpen(false)}
        onSendBible={sendBibleMessage}
      />

      {/* ── Modal: perfil de miembro del grupo ── */}
      {/* Ficha de un miembro del grupo: sus datos y lo que se puede hacer con él.
          Las reglas de quién ve qué (moderación solo para admins, y nunca sobre uno
          mismo) viven dentro del componente. */}
      {memberModal && (
        <GroupMemberSheet
          member={memberModal}
          memberIsAdmin={currentConv?.admins?.includes(memberModal._id) ?? false}
          iAmAdmin={iAmAdmin}
          isMe={memberModal._id === user?.id}
          loading={memberActionLoading}
          colors={colors}
          bottomInset={insets.bottom}
          onClose={() => setMemberModal(null)}
          onMessage={handleMemberMessage}
          onCall={handleMemberCall}
          onInfo={() => {
            const id = memberModal._id;
            setMemberModal(null);
            router.push({ pathname: "/contact/[id]" as any, params: { id, conversationId } });
          }}
          onToggleAdmin={handleToggleMemberAdmin}
          onRemove={handleRemoveMember}
        />
      )}

    </KeyboardAvoidingView>
  );
}
