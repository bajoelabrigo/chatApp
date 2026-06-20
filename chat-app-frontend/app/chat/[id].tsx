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
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioRecorder, requestRecordingPermissionsAsync, setAudioModeAsync, RecordingPresets } from 'expo-audio';
import { Feather, FontAwesome5, Ionicons } from '@expo/vector-icons';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useChatsStore } from '../../src/store/useChatsStore';
import { useCallStore } from '../../src/store/useCallStore';
import { useTheme } from '../../src/context/ThemeContext';
import { getSocket } from '../../src/services/socketService';
import {
  getMessages,
  createOrGetConversation,
  toggleGroupAdmin,
  removeGroupMember,
  apiToggleMute,
} from '../../src/services/conversationService';
import { uploadFile } from '../../src/services/uploadService';
import { MessageBubble, docIcon } from '../../src/components/chat/MessageBubble';
import BibleModal from '../../src/components/chat/BibleModal';
import type { Message, ChatUser } from '../../src/services/conversationService';

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

function docIconFor(type?: string, fileName?: string): string {
  if (type === 'image') return '🖼️';
  if (type === 'audio') return '🎤';
  return docIcon(fileName);
}

// ── Date-separator helpers ───────────────────────────────
type ListItem =
  | { kind: 'message'; data: Message }
  | { kind: 'separator'; key: string; label: string };

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const key = toDateKey(d);
  const now = new Date();
  if (key === toDateKey(now)) return 'Hoy';
  const yd = new Date(now);
  yd.setDate(yd.getDate() - 1);
  if (key === toDateKey(yd)) return 'Ayer';
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

function buildListData(messages: Message[]): ListItem[] {
  const items: ListItem[] = [];
  let lastKey = '';
  for (const msg of messages) {
    const key = toDateKey(new Date(msg.createdAt));
    if (key !== lastKey) {
      items.push({ kind: 'separator', key: `sep_${key}`, label: formatDateLabel(msg.createdAt) });
      lastKey = key;
    }
    items.push({ kind: 'message', data: msg });
  }
  return items;
}

function DateSeparator({ label, colors }: { label: string; colors: any }) {
  return (
    <View style={{ alignItems: 'center', marginVertical: 8 }}>
      <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500' }}>{label}</Text>
      </View>
    </View>
  );
}

function TypingIndicator({ colors, avatar, name }: { colors: any; avatar?: string; name?: string }) {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 280, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.delay((2 - i) * 160 + 100),
        ])
      )
    );
    Animated.parallel(anims).start();
    return () => anims.forEach((a) => a.stop());
  }, []);

  return (
    <View style={{ paddingHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'flex-end' }}>
      {/* Avatar */}
      {avatar ? (
        <Image source={{ uri: avatar }} style={{ width: 30, height: 30, borderRadius: 8, marginRight: 6 }} />
      ) : (
        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>{name?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
      )}
      {/* Bubble with dots */}
      <View style={{
        paddingHorizontal: 16, paddingVertical: 14,
        borderRadius: 18, borderTopLeftRadius: 4,
        backgroundColor: colors.bubbleTheirs,
        flexDirection: 'row', alignItems: 'center', gap: 5,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
        borderWidth: 1, borderColor: colors.borderLight,
      }}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: colors.bubbleTheirsText,
              opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
              transform: [{
                translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }),
              }],
            }}
          />
        ))}
      </View>
    </View>
  );
}
// ────────────────────────────────────────────────────────

const REPLY_THRESHOLD = 64;

function SwipeableMessage({ children, onSwipeRight }: {
  children: React.ReactNode;
  onSwipeRight: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const triggered = useRef(false);

  const snapBack = () => {
    Animated.parallel([
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
      Animated.timing(iconOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        dx > 5 && Math.abs(dx) > Math.abs(dy),
      onPanResponderMove: (_, { dx }) => {
        if (dx > 0) {
          const clamped = Math.min(dx, REPLY_THRESHOLD + 16);
          translateX.setValue(clamped);
          iconOpacity.setValue(Math.min(clamped / REPLY_THRESHOLD, 1));
          if (clamped >= REPLY_THRESHOLD && !triggered.current) {
            triggered.current = true;
          }
        }
      },
      onPanResponderRelease: (_, { dx }) => {
        const shouldReply = triggered.current;
        triggered.current = false;
        snapBack();
        if (shouldReply || dx >= REPLY_THRESHOLD) {
          onSwipeRight();
        }
      },
      onPanResponderTerminate: () => {
        triggered.current = false;
        snapBack();
      },
    })
  ).current;

  return (
    <View>
      <Animated.View style={{
        position: 'absolute', left: 16, top: 0, bottom: 0,
        alignItems: 'center', justifyContent: 'center',
        opacity: iconOpacity,
      }}>
        <View style={{
          width: 32, height: 32, borderRadius: 16,
          backgroundColor: 'rgba(120,120,120,0.35)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="return-up-back" size={17} color="#fff" />
        </View>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
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
  const [reactionEmojiPickerOpen, setReactionEmojiPickerOpen] = useState(false);
  const [memberModal, setMemberModal] = useState<ChatUser | null>(null);
  const [memberActionLoading, setMemberActionLoading] = useState(false);

  // Grabación de voz
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false); // ref para leer el estado sincrónico en onPressOut
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);

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
  const socket = getSocket();
  // DEBUG — eliminar después del diagnóstico
  if (__DEV__) console.log('[socket] connected=', socket?.connected, 'exists=', !!socket);

  const reactionDetailMessage = useMemo(() => {
    if (!reactionDetail) return null;
    return conversationMessages.find((m) => m._id === reactionDetail.messageId) ?? null;
  }, [reactionDetail, conversationMessages]);

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

  const handleChangeText = (value: string) => {
    setText(value);
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
    });
    setText('');
    setReplyingTo(null);
  };

  // ── Enviar archivo (imagen / documento / audio) ─────────
  const sendFileMessage = async (
    fileUri: string,
    mimeType: string,
    fileName: string,
    messageType: 'image' | 'audio' | 'document'
  ) => {
    if (!token || !socket || !user) return;
    setUploading(true);
    try {
      const result = await uploadFile(token, fileUri, mimeType, fileName);

      const temp: Message = {
        _id: `temp_${Date.now()}`,
        conversationId,
        senderId: { _id: user.id, name: user.name, email: user.email ?? '', avatar: user.avatar },
        content: result.url,
        type: messageType,
        fileName: result.originalName,
        fileSize: result.size,
        status: 'sent',
        createdAt: new Date().toISOString(),
      };
      addMessage(temp);

      socket.emit('message:send', {
        conversationId,
        content: result.url,
        type: messageType,
        fileName: result.originalName,
        fileSize: result.size,
        cloudinaryPublicId: result.publicId,
      });
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
  const startRecording = async () => {
    if (isRecordingRef.current) return;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permiso denegado', 'Activa el micrófono en Ajustes.'); return; }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      await recorder.record();

      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordSeconds(0);
      recordingTimer.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      Alert.alert('Error', 'No se pudo iniciar la grabación');
    }
  };

  const stopRecording = async (cancel = false) => {
    if (!isRecordingRef.current) return;
    if (recordingTimer.current) { clearInterval(recordingTimer.current); recordingTimer.current = null; }

    isRecordingRef.current = false;
    setIsRecording(false);
    setRecordSeconds(0);

    try {
      await recorder.stop();
      if (!cancel) {
        const uri = recorder.uri;
        if (uri) await sendFileMessage(uri, 'audio/m4a', `voice_${Date.now()}.m4a`, 'audio');
      }
    } catch {
      // silencioso
    } finally {
      await setAudioModeAsync({ allowsRecording: false });
    }
  };

  // ── Descarga y compartir ────────────────────────────────
  const handleDownload = (msg: Message) => {
    // Abre la URL — en Android el navegador descarga automáticamente
    Linking.openURL(msg.content);
  };

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

  const handleReactFromBubble = (msg: Message, emoji: string) => {
    socket?.emit('message:react', { messageId: msg._id, conversationId, emoji });
  };

  const handleOpenReactionDetail = (msg: Message, emoji: string) => {
    setReactionDetail({ messageId: msg._id, filterEmoji: emoji });
  };

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

  const handleLongPress = (msg: Message) => setActionMessage(msg);

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
              <Image source={{ uri: avatar }} style={{ width: 40, height: 40, borderRadius: 10, marginRight: 10 }} />
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
                  highlighted={item.data._id === highlightedId}
                  onLongPress={handleLongPress}
                  onDownload={handleDownload}
                  onReact={handleReactFromBubble}
                  onReactDetail={handleOpenReactionDetail}
                  onAvatarPress={isGroupChat ? (sender) => setMemberModal(sender) : undefined}
                  onCallBack={(msg) => {
                    if (!otherParticipant || callState !== 'idle') return;
                    startCall({
                      peerId: otherParticipant._id,
                      peerName: otherParticipant.name,
                      peerAvatar: otherParticipant.avatar,
                      conversationId,
                      callType: msg.callType ?? 'audio',
                    });
                  }}
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

      {/* Reply banner */}
      {replyingTo && !editingMessage && (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgSecondary, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.accent }}>
          <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: colors.accent, borderRadius: 2, marginRight: 10 }} />
          {replyingTo.type === 'image' && (
            <Image
              source={{ uri: replyingTo.content }}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
            <TouchableOpacity onPress={() => stopRecording(true)} style={{ padding: 8 }}>
              <Text style={{ color: colors.danger, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />
              <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Grabando...</Text>
            </View>
            <TouchableOpacity
              onPress={() => stopRecording(false)}
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: 20 }}>✓</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 8, gap: 8 }}>
            <TouchableOpacity
              onPress={() => { setBibleOpen(true); setEmojiOpen(false); Keyboard.dismiss(); }}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
            >
              <FontAwesome5 name="bible" size={24} color={colors.accent} />
            </TouchableOpacity>

            {/* Input con emoji integrado */}
            <View style={{
              flex: 1, flexDirection: 'row', alignItems: 'flex-end',
              backgroundColor: colors.inputBg, borderRadius: 22,
              borderWidth: 1, borderColor: colors.border,
            }}>
              <TouchableOpacity
                onPress={toggleEmojiPicker}
                style={{ paddingHorizontal: 10, paddingBottom: 11 }}
              >
                {emojiOpen
                  ? <Ionicons name="text" size={22} color={colors.accent} />
                  : <Ionicons name="happy" size={26} color={colors.accent} />}
              </TouchableOpacity>
              <TextInput
                ref={inputRef}
                style={{
                  flex: 1, color: colors.inputText,
                  paddingRight: 14, paddingVertical: 10,
                  fontSize: 16, maxHeight: 112,
                }}
                placeholder="Mensaje"
                placeholderTextColor={colors.inputPlaceholder}
                value={text}
                onChangeText={handleChangeText}
                onFocus={() => setEmojiOpen(false)}
                multiline
              />
            </View>

            {showMicOrSend && (
              <TouchableOpacity
                onPress={() => { setAttachOpen(true); Keyboard.dismiss(); setEmojiOpen(false); }}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
              >
                <Ionicons name="add" size={22} color={colors.accent} />
              </TouchableOpacity>
            )}

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
              <TouchableOpacity onPress={pickDocument} style={{ ...sheetRowStyle, borderBottomWidth: 0 }}>
                <Text style={{ fontSize: 24, marginRight: 16 }}>📄</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Documento</Text>
              </TouchableOpacity>
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
                            source={{ uri: avatarUri }}
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

      <BibleModal
        visible={bibleOpen}
        onClose={() => setBibleOpen(false)}
        onSendVerses={(verseText) => {
          setText((prev) => (prev ? prev + '\n' + verseText : verseText));
          setBibleOpen(false);
        }}
      />

      {/* ── Modal: perfil de miembro del grupo ── */}
      <Modal
        visible={!!memberModal}
        transparent
        animationType="slide"
        onRequestClose={() => setMemberModal(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
          onPress={() => !memberActionLoading && setMemberModal(null)}
        >
          <Pressable onPress={() => {}}>
            {(() => {
              const member = memberModal;
              if (!member) return null;
              const memberIsAdmin = currentConv?.admins?.includes(member._id) ?? false;
              const isMe = member._id === user?.id;
              return (
                <View style={{
                  backgroundColor: colors.actionSheetBg,
                  borderTopLeftRadius: 28, borderTopRightRadius: 28,
                  paddingBottom: insets.bottom + 12,
                }}>
                  {/* Drag handle + X */}
                  <View style={{ alignItems: 'center', paddingTop: 10 }}>
                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
                  </View>
                  <TouchableOpacity
                    onPress={() => setMemberModal(null)}
                    style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </TouchableOpacity>

                  {/* Avatar con anillo */}
                  <View style={{ alignItems: 'center', paddingTop: 20, paddingBottom: 12 }}>
                    <View style={{ padding: 3, borderRadius: 50, borderWidth: 2.5, borderColor: colors.accent }}>
                      {member.avatar ? (
                        <Image source={{ uri: member.avatar }} style={{ width: 72, height: 72, borderRadius: 36 }} />
                      ) : (
                        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: colors.accent, fontSize: 28, fontWeight: '700' }}>
                            {member.name[0]?.toUpperCase() ?? '?'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: 14 }}>
                      {member.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 3 }}>
                      {member.email}
                    </Text>
                    {memberIsAdmin && (
                      <View style={{ marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.accent + '20', borderWidth: 1, borderColor: colors.accent + '40' }}>
                        <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>Admin</Text>
                      </View>
                    )}
                  </View>

                  {/* 3 botones: Mensaje / Llamar / Video */}
                  {!isMe && (
                    <View style={{ flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 12 }}>
                      {([
                        { icon: 'chatbubble-outline' as const, label: 'Mensaje', onPress: handleMemberMessage },
                        { icon: 'call-outline' as const, label: 'Llamar', onPress: () => handleMemberCall('audio') },
                        { icon: 'videocam-outline' as const, label: 'Video', onPress: () => handleMemberCall('video') },
                      ] as const).map(({ icon, label, onPress }) => (
                        <TouchableOpacity
                          key={label}
                          onPress={onPress}
                          disabled={memberActionLoading}
                          style={{
                            flex: 1, alignItems: 'center', justifyContent: 'center',
                            paddingVertical: 14, borderRadius: 16,
                            backgroundColor: colors.bgTertiary,
                            borderWidth: 1, borderColor: colors.border,
                            gap: 6,
                          }}
                        >
                          {memberActionLoading
                            ? <ActivityIndicator size="small" color={colors.accent} />
                            : <Ionicons name={icon} size={22} color={colors.accent} />}
                          <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '500' }}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Fila: Info */}
                  {!isMe && (
                    <TouchableOpacity
                      onPress={() => {
                        setMemberModal(null);
                        router.push({ pathname: '/contact/[id]' as any, params: { id: member._id, conversationId } });
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border }}
                    >
                      <Ionicons name="information-circle-outline" size={22} color={colors.textPrimary} style={{ marginRight: 14 }} />
                      <Text style={{ color: colors.textPrimary, fontSize: 16, flex: 1 }}>Info.</Text>
                    </TouchableOpacity>
                  )}

                  {/* Fila: Designar / Quitar admin — solo visible para admins sobre otros miembros */}
                  {iAmAdmin && !isMe && (
                    <TouchableOpacity
                      onPress={handleToggleMemberAdmin}
                      disabled={memberActionLoading}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border }}
                    >
                      <Ionicons name="shield-checkmark-outline" size={22} color={colors.textPrimary} style={{ marginRight: 14 }} />
                      <Text style={{ color: colors.textPrimary, fontSize: 16, flex: 1 }}>
                        {memberIsAdmin ? 'Quitar como admin' : 'Designar como admin. del grupo'}
                      </Text>
                      {memberActionLoading && <ActivityIndicator size="small" color={colors.accent} />}
                    </TouchableOpacity>
                  )}

                  {/* Fila: Quitar del grupo — solo admins sobre no-admins o sobre cualquiera si es el único admin */}
                  {iAmAdmin && !isMe && (
                    <TouchableOpacity
                      onPress={handleRemoveMember}
                      disabled={memberActionLoading}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border }}
                    >
                      <Ionicons name="remove-circle-outline" size={22} color={colors.danger} style={{ marginRight: 14 }} />
                      <Text style={{ color: colors.danger, fontSize: 16, flex: 1 }}>Quitar del grupo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

    </KeyboardAvoidingView>
  );
}
