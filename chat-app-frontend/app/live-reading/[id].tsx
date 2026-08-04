import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, ActivityIndicator, Image, Pressable, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStore } from '../../src/store/useAuthStore';
import { getSocket } from '../../src/services/socketService';
import { fetchVerses, type BibleVerse } from '../../src/services/bibleService';
import { CrossRefsList } from '../../src/components/bible/CrossRefsList';
import type { VerseItem } from '../../src/constants/bible';
import { cld } from '../../src/lib/cldImage';

// Lectura en vivo GUIADA por un anfitrión: el grupo lee el mismo pasaje a la vez;
// el anfitrión marca el versículo que se lee y a todos se les resalta y se
// desplaza solo. Sesión efímera (socket). Ver socketHandler `reading:*`.

interface Participant { userId: string; name: string; avatar?: string | null }
interface ReadingState {
  groupId: string; hostId: string; book: string; chapter: string; version: string;
  currentVerse: number; participants: Participant[];
  // Versículo cuyas referencias cruzadas está enseñando el anfitrión al grupo
  // (null = nada abierto). Lo abre él desde la web; aquí se sigue.
  refsVerse?: number | null;
}
interface FloatingAmen { id: number; name: string }

export default function LiveReadingScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { token, user } = useAuthStore();
  const { id: groupId, host, book, chapter, version } = useLocalSearchParams<{
    id: string; host?: string; book?: string; chapter?: string; version?: string;
  }>();

  const socket = getSocket();
  const [state, setState] = useState<ReadingState | null>(null);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [ended, setEnded] = useState(false);
  const [amens, setAmens] = useState<FloatingAmen[]>([]);
  const listRef = useRef<FlatList<BibleVerse>>(null);
  const amenSeq = useRef(0);

  const isHost = !!state && state.hostId === user?.id;
  const isDark = colors.bgPrimary === '#0A0A0A';

  // Arrancar / unirse al montar. Salir al desmontar.
  useEffect(() => {
    if (!socket || !groupId) return;
    if (host === '1' && book && chapter) {
      socket.emit('reading:start', { groupId, book, chapter, version: version || 'RV1909' });
    } else {
      socket.emit('reading:join', { groupId });
    }

    const onState = (s: ReadingState) => { if (s.groupId === groupId) setState(s); };
    const onVerse = (p: { groupId: string; verse: number }) => {
      if (p.groupId !== groupId) return;
      setState((prev) => (prev ? { ...prev, currentVerse: p.verse } : prev));
    };
    const onPresence = (p: { groupId: string; participants: Participant[] }) => {
      if (p.groupId !== groupId) return;
      setState((prev) => (prev ? { ...prev, participants: p.participants } : prev));
    };
    // El anfitrión abrió/cerró las referencias de un versículo para todos.
    const onRefs = (p: { groupId: string; verse: number | null }) => {
      if (p.groupId !== groupId) return;
      setState((prev) => (prev ? { ...prev, refsVerse: p.verse } : prev));
    };
    const onAmen = (p: { groupId: string; name: string }) => {
      if (p.groupId !== groupId) return;
      const id = ++amenSeq.current;
      setAmens((prev) => [...prev, { id, name: p.name }]);
      setTimeout(() => setAmens((prev) => prev.filter((a) => a.id !== id)), 2200);
    };
    const onEnded = (p: { groupId: string }) => { if (p.groupId === groupId) setEnded(true); };

    socket.on('reading:state', onState);
    socket.on('reading:verse', onVerse);
    socket.on('reading:presence', onPresence);
    socket.on('reading:refs', onRefs);
    socket.on('reading:amen', onAmen);
    socket.on('reading:ended', onEnded);
    return () => {
      socket.emit('reading:leave', { groupId });
      socket.off('reading:state', onState);
      socket.off('reading:verse', onVerse);
      socket.off('reading:presence', onPresence);
      socket.off('reading:refs', onRefs);
      socket.off('reading:amen', onAmen);
      socket.off('reading:ended', onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Cargar el capítulo cuando llega el estado (pasaje).
  useEffect(() => {
    if (!token || !state?.book || !state?.chapter) return;
    let cancelled = false;
    fetchVerses(token, state.book, state.chapter, state.version)
      .then((v) => { if (!cancelled) setVerses(v); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, state?.book, state?.chapter, state?.version]);

  // Desplazar al versículo actual (para todos).
  useEffect(() => {
    if (!state || verses.length === 0) return;
    const index = verses.findIndex((v) => Number(v.verse) === state.currentVerse);
    if (index >= 0) {
      setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.35, animated: true }), 60);
    }
  }, [state?.currentVerse, verses]);

  const setVerse = (verse: number) => {
    if (!isHost || !socket) return;
    socket.emit('reading:verse', { groupId, verse });
    setState((prev) => (prev ? { ...prev, currentVerse: verse } : prev));
  };

  const amen = () => socket?.emit('reading:amen', { groupId });
  const endOrLeave = () => {
    if (isHost) socket?.emit('reading:end', { groupId });
    router.back();
  };

  const ref = state ? `${state.book} ${state.chapter}` : 'Lectura en vivo';
  const participants = state?.participants ?? [];

  // Referencias que el anfitrión le está enseñando al grupo. Aquí no se abren
  // (las guía él, desde la web, donde caben al lado del texto): esta pantalla
  // las SIGUE, para que quien lee desde el móvil vea de qué está hablando.
  const refsVerse = state?.refsVerse ?? null;
  const refsTarget: VerseItem | null =
    refsVerse && state
      ? {
          book: state.book,
          chapter: String(state.chapter),
          verse: String(refsVerse),
          text: verses.find((v) => Number(v.verse) === refsVerse)?.text ?? '',
        }
      : null;

  const renderVerse = ({ item }: { item: BibleVerse }) => {
    const num = Number(item.verse);
    const active = state?.currentVerse === num;
    return (
      <Pressable
        onPress={() => isHost && setVerse(num)}
        style={{
          paddingHorizontal: 18, paddingVertical: 8,
          backgroundColor: active ? (isDark ? 'rgba(99,102,241,0.28)' : colors.accent + '22') : 'transparent',
          borderLeftWidth: 3, borderLeftColor: active ? colors.accent : 'transparent',
        }}
      >
        <Text style={{ fontSize: 17, lineHeight: 27, color: active ? colors.textPrimary : colors.textSecondary }}>
          <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>{item.verse} </Text>
          {item.text}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary, paddingTop: insets.top }}>
      {/* Cabecera */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 }}>
        <TouchableOpacity onPress={endOrLeave} style={{ padding: 4 }}>
          <Ionicons name="chevron-down" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' }} />
            <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 12 }}>LECTURA EN VIVO</Text>
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{ref}</Text>
        </View>
        {/* Presencia */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {participants.slice(0, 4).map((p, i) =>
            p.avatar ? (
              <Image key={p.userId} source={{ uri: cld(p.avatar, 26) }} style={{ width: 26, height: 26, borderRadius: 13, marginLeft: i === 0 ? 0 : -8, borderWidth: 1.5, borderColor: colors.bgPrimary }} />
            ) : (
              <View key={p.userId} style={{ width: 26, height: 26, borderRadius: 13, marginLeft: i === 0 ? 0 : -8, backgroundColor: colors.bgTertiary, borderWidth: 1.5, borderColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>{p.name[0]?.toUpperCase()}</Text>
              </View>
            )
          )}
          {participants.length > 0 && (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 6 }}>{participants.length}</Text>
          )}
        </View>
      </View>

      {ended ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
          <Ionicons name="book" size={44} color={colors.textMuted} />
          <Text style={{ color: colors.textSecondary, fontSize: 16, textAlign: 'center' }}>La lectura en vivo terminó.</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 22, backgroundColor: colors.accent }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Volver al chat</Text>
          </TouchableOpacity>
        </View>
      ) : verses.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={verses}
          keyExtractor={(v) => v.verse}
          renderItem={renderVerse}
          // `flex: 1` explícito: cuando el anfitrión abre las referencias, el
          // panel es hermano de esta lista y necesita que ella encoja para
          // dejarle sitio, en vez de empujarlo fuera de la pantalla.
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 16, paddingBottom: 120 }}
          onScrollToIndexFailed={() => {}}
        />
      )}

      {/* Referencias que enseña el anfitrión. Ocupan como mucho el 45% de la
          pantalla: el texto que se está leyendo tiene que seguir a la vista. */}
      {refsTarget && !ended && token && (
        <View
          style={{
            maxHeight: '45%',
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.bgSecondary,
            paddingHorizontal: 16,
            paddingBottom: 8,
            marginBottom: 76 + insets.bottom, // deja libre la barra inferior
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 }}>
            <Ionicons name="git-network-outline" size={16} color={colors.accent} />
            <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700' }}>
              Referencias · {refsTarget.book} {refsTarget.chapter}:{refsTarget.verse}
            </Text>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
            <CrossRefsList
              verse={refsTarget}
              token={token}
              version={state?.version ?? 'RV1909'}
              colors={colors}
            />
          </ScrollView>
        </View>
      )}

      {/* Amenes flotantes */}
      <View pointerEvents="none" style={{ position: 'absolute', bottom: 96, left: 0, right: 0, alignItems: 'center', gap: 4 }}>
        {amens.map((a) => (
          <View key={a.id} style={{ backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>🙏 {a.name} dice Amén</Text>
          </View>
        ))}
      </View>

      {/* Barra inferior */}
      {!ended && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgSecondary }}>
          {isHost ? (
            <>
              <TouchableOpacity onPress={() => setVerse(Math.max(1, (state?.currentVerse ?? 1) - 1))} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 22, backgroundColor: colors.bgTertiary }}>
                <Ionicons name="chevron-up" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={{ paddingHorizontal: 14 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Versículo</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{state?.currentVerse ?? 1}</Text>
              </View>
              <TouchableOpacity onPress={() => setVerse(Math.min(verses.length, (state?.currentVerse ?? 1) + 1))} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 22, backgroundColor: colors.accent }}>
                <Ionicons name="chevron-down" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={amen} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 24, backgroundColor: colors.accent }}>
              <Text style={{ fontSize: 18 }}>🙏</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Amén</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
