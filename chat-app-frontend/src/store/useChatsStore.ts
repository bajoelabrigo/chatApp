import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSocket } from '../services/socketService';
import type { Conversation, Message, Reaction } from '../services/conversationService';

interface ChatsState {
  conversations: Conversation[];
  archivedConversations: Conversation[];
  messages: Record<string, Message[]>;
  onlineUsers: Set<string>;
  typingUsers: Record<string, string[]>;
  currentUserId: string | null;

  setCurrentUserId: (id: string) => void;
  setConversations: (convs: Conversation[]) => void;
  setArchivedConversations: (convs: Conversation[]) => void;
  upsertConversation: (conv: Conversation) => void;
  resetUnreadCount: (conversationId: string) => void;
  setMessages: (conversationId: string, msgs: Message[]) => void;
  prependMessages: (conversationId: string, msgs: Message[]) => void;
  addMessage: (msg: Message) => void;
  updateMessageStatus: (conversationId: string, messageId: string, status: Message['status']) => void;
  markConversationRead: (conversationId: string, readerId: string) => void;
  editMessage: (messageId: string, conversationId: string, content: string, editedAt: string) => void;
  deleteMessage: (messageId: string, conversationId: string, deletedForEveryone: boolean, currentUserId?: string) => void;
  updateReactions: (messageId: string, conversationId: string, reactions: Reaction[]) => void;
  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string) => void;
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void;

  // Conversation actions (optimistic updates)
  pinConversation: (id: string, pinned: boolean) => void;
  archiveConversation: (id: string) => void;
  unarchiveConversation: (id: string) => void;
  favoriteConversation: (id: string, favorited: boolean) => void;
  muteConversation: (id: string, muted: boolean) => void;
  blockConversation: (id: string) => void;
  unblockConversation: (id: string) => void;

  bindSocketEvents: () => void;
  unbindSocketEvents: () => void;
}

export const useChatsStore = create<ChatsState>()(
  persist(
    (set, get) => ({
  conversations: [],
  archivedConversations: [],
  messages: {},
  onlineUsers: new Set(),
  typingUsers: {},
  currentUserId: null,

  setCurrentUserId: (id) => set({ currentUserId: id }),
  setConversations: (convs) => set({ conversations: convs }),
  setArchivedConversations: (convs) => set({ archivedConversations: convs }),

  resetUnreadCount: (conversationId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c._id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
    })),

  upsertConversation: (conv) =>
    set((s) => {
      const exists = s.conversations.find((c) => c._id === conv._id);
      if (exists) {
        return { conversations: s.conversations.map((c) => (c._id === conv._id ? conv : c)) };
      }
      return { conversations: [conv, ...s.conversations] };
    }),

  setMessages: (conversationId, msgs) =>
    set((s) => {
      const existing = s.messages[conversationId] ?? [];
      // Keep optimistic (temp_) messages not yet confirmed in the API response
      const confirmedSet = new Set(msgs.map((m) => `${m.content}|${m.senderId._id}`));
      const pendingTemps = existing.filter(
        (m) => m._id.startsWith('temp_') && !confirmedSet.has(`${m.content}|${m.senderId._id}`)
      );
      return { messages: { ...s.messages, [conversationId]: [...msgs, ...pendingTemps] } };
    }),

  prependMessages: (conversationId, msgs) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: [...msgs, ...(s.messages[conversationId] ?? [])],
      },
    })),

  addMessage: (msg) =>
    set((s) => {
      const existing = s.messages[msg.conversationId] ?? [];
      if (existing.find((m) => m._id === msg._id)) return {};
      const tempIndex = msg._id.startsWith('temp_')
        ? -1
        : existing.findIndex(
            (m) =>
              m._id.startsWith('temp_') &&
              m.content === msg.content &&
              m.senderId._id === msg.senderId._id
          );
      const updated =
        tempIndex >= 0
          ? existing.map((m, i) => (i === tempIndex ? msg : m))
          : [...existing, msg];

      const isFromOther = msg.senderId._id !== s.currentUserId;
      const conversations = s.conversations.map((c) => {
        if (c._id !== msg.conversationId) return c;
        return {
          ...c,
          lastMessage: msg,
          lastMessageAt: msg.createdAt,
          unreadCount: isFromOther ? (c.unreadCount ?? 0) + 1 : c.unreadCount,
        };
      });
      conversations.sort(
        (a, b) =>
          new Date(b.lastMessageAt ?? b.createdAt).getTime() -
          new Date(a.lastMessageAt ?? a.createdAt).getTime()
      );
      return { messages: { ...s.messages, [msg.conversationId]: updated }, conversations };
    }),

  updateMessageStatus: (conversationId, messageId, status) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m._id === messageId ? { ...m, status } : m
        ),
      },
    })),

  markConversationRead: (conversationId, readerId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m.senderId._id !== readerId ? { ...m, status: 'read' as const } : m
        ),
      },
    })),

  editMessage: (messageId, conversationId, content, editedAt) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m._id === messageId ? { ...m, content, editedAt } : m
        ),
      },
    })),

  deleteMessage: (messageId, conversationId, deletedForEveryone, currentUserId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) => {
          if (m._id !== messageId) return m;
          if (deletedForEveryone) return { ...m, isDeletedForEveryone: true, reactions: [] };
          return { ...m, deletedFor: [...(m.deletedFor ?? []), currentUserId ?? ''] };
        }),
      },
    })),

  updateReactions: (messageId, conversationId, reactions) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m._id === messageId ? { ...m, reactions } : m
        ),
      },
    })),

  setUserOnline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUsers);
      next.add(userId);
      return { onlineUsers: next };
    }),

  setUserOffline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUsers);
      next.delete(userId);
      return { onlineUsers: next };
    }),

  setTyping: (conversationId, userId, isTyping) =>
    set((s) => {
      const current = s.typingUsers[conversationId] ?? [];
      const next = isTyping
        ? [...new Set([...current, userId])]
        : current.filter((id) => id !== userId);
      return { typingUsers: { ...s.typingUsers, [conversationId]: next } };
    }),

  pinConversation: (id, pinned) =>
    set((s) => ({
      conversations: s.conversations.map((c) => c._id === id ? { ...c, isPinned: pinned } : c),
    })),

  archiveConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.filter((c) => c._id !== id),
    })),

  unarchiveConversation: (id) =>
    set((s) => {
      const conv = s.archivedConversations.find((c) => c._id === id);
      const updatedArchived = s.archivedConversations.filter((c) => c._id !== id);
      if (!conv) return { archivedConversations: updatedArchived };
      const restored = { ...conv, isArchived: false };
      const updatedConvs = [...s.conversations, restored].sort(
        (a, b) =>
          new Date(b.lastMessageAt ?? b.createdAt).getTime() -
          new Date(a.lastMessageAt ?? a.createdAt).getTime()
      );
      return { archivedConversations: updatedArchived, conversations: updatedConvs };
    }),

  favoriteConversation: (id, favorited) =>
    set((s) => ({
      conversations: s.conversations.map((c) => c._id === id ? { ...c, isFavorite: favorited } : c),
      archivedConversations: s.archivedConversations.map((c) => c._id === id ? { ...c, isFavorite: favorited } : c),
    })),

  muteConversation: (id, muted) =>
    set((s) => ({
      conversations: s.conversations.map((c) => c._id === id ? { ...c, isMuted: muted } : c),
      archivedConversations: s.archivedConversations.map((c) => c._id === id ? { ...c, isMuted: muted } : c),
    })),

  blockConversation: (id) =>
    set((s) => {
      // Move to archivedConversations so unblockConversation can restore it
      const conv = s.conversations.find((c) => c._id === id);
      return {
        conversations: s.conversations.filter((c) => c._id !== id),
        archivedConversations: conv
          ? [...s.archivedConversations.filter((c) => c._id !== id), { ...conv, isBlocked: true }]
          : s.archivedConversations,
      };
    }),

  unblockConversation: (id) =>
    set((s) => {
      const conv = s.archivedConversations.find((c) => c._id === id);
      const updatedArchived = s.archivedConversations.filter((c) => c._id !== id);
      if (!conv) return { archivedConversations: updatedArchived };
      const restored = { ...conv, isArchived: false, isBlocked: false };
      const updatedConvs = [...s.conversations, restored].sort(
        (a, b) =>
          new Date(b.lastMessageAt ?? b.createdAt).getTime() -
          new Date(a.lastMessageAt ?? a.createdAt).getTime()
      );
      return { archivedConversations: updatedArchived, conversations: updatedConvs };
    }),

  bindSocketEvents: () => {
    const socket = getSocket();
    console.log('[bindSocketEvents] socket=', !!socket, 'connected=', socket?.connected);
    if (!socket) return;
    const store = get();

    socket.on('group:new', (conv: Conversation) => {
      store.upsertConversation(conv);
      socket.emit('conversation:join', { conversationId: conv._id });
    });
    socket.on('group:deleted', ({ groupId }: { groupId: string }) => {
      set((s) => ({
        conversations: s.conversations.filter((c) => c._id !== groupId),
        archivedConversations: s.archivedConversations.filter((c) => c._id !== groupId),
      }));
    });
    socket.on('message:new', (msg: Message) => store.addMessage(msg));
    socket.on(
      'message:delivered',
      ({ messageId, conversationId }: { messageId: string; conversationId: string }) =>
        store.updateMessageStatus(conversationId, messageId, 'delivered')
    );
    socket.on(
      'message:read',
      ({ conversationId, readerId }: { conversationId: string; readerId: string }) =>
        store.markConversationRead(conversationId, readerId)
    );
    socket.on(
      'message:edited',
      ({
        messageId,
        conversationId,
        content,
        editedAt,
      }: {
        messageId: string;
        conversationId: string;
        content: string;
        editedAt: string;
      }) => {
        console.log('[store] message:edited received', messageId);
        store.editMessage(messageId, conversationId, content, editedAt);
      }
    );
    socket.on(
      'message:deleted',
      ({
        messageId,
        conversationId,
        deletedForEveryone,
        userId,
      }: {
        messageId: string;
        conversationId: string;
        deletedForEveryone: boolean;
        userId?: string;
      }) => {
        console.log('[store] message:deleted received', messageId, 'forEveryone=', deletedForEveryone);
        store.deleteMessage(messageId, conversationId, deletedForEveryone, userId);
      }
    );
    socket.on(
      'message:reaction',
      ({ messageId, conversationId, reactions }: { messageId: string; conversationId: string; reactions: Reaction[] }) => {
        console.log('[store] message:reaction received', messageId, reactions);
        store.updateReactions(messageId, conversationId, reactions);
      }
    );
    socket.on('users:online', ({ userIds }: { userIds: string[] }) => {
      userIds.forEach((id) => store.setUserOnline(id));
    });
    socket.on('user:online', ({ userId }: { userId: string }) => store.setUserOnline(userId));
    socket.on('user:offline', ({ userId }: { userId: string }) => store.setUserOffline(userId));
    socket.on(
      'typing:start',
      ({ userId, conversationId }: { userId: string; conversationId: string }) =>
        store.setTyping(conversationId, userId, true)
    );
    socket.on(
      'typing:stop',
      ({ userId, conversationId }: { userId: string; conversationId: string }) =>
        store.setTyping(conversationId, userId, false)
    );
  },

  unbindSocketEvents: () => {
    const socket = getSocket();
    if (!socket) return;
    socket.off('group:new');
    socket.off('group:deleted');
    socket.off('message:new');
    socket.off('message:delivered');
    socket.off('message:read');
    socket.off('message:edited');
    socket.off('message:deleted');
    socket.off('message:reaction');
    socket.off('users:online');
    socket.off('user:online');
    socket.off('user:offline');
    socket.off('typing:start');
    socket.off('typing:stop');
  },
    }),
    {
      name: 'chats-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        conversations: state.conversations,
        archivedConversations: state.archivedConversations,
        messages: state.messages,
      }),
    }
  )
);
