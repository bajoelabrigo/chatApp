import { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';

// Mismo set que el chat (app/chat/[id].tsx) para que reaccionar se sienta igual
// en toda la app.
export const QUICK_REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🙏'];

export function AnimatedReactionPill({
  emoji, count, reacted, colors, onPress,
}: {
  emoji: string; count: number; reacted: boolean; colors: any;
  onPress: (emoji: string) => void;
}) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 200 }).start();
  }, []);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 75, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 220 }),
    ]).start();
    onPress(emoji);
  };

  const pillBg = reacted ? colors.accent + '20' : colors.bgTertiary;
  const pillBorder = reacted ? colors.accent : colors.border;
  const countColor = reacted ? colors.accent : colors.textSecondary;

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.75}>
      <Animated.View style={{
        transform: [{ scale }],
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: pillBg, borderWidth: 1, borderColor: pillBorder,
        borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4,
      }}>
        <Text style={{ fontSize: 14 }}>{emoji}</Text>
        {count > 1 && <Text style={{ color: countColor, fontSize: 11, fontWeight: '700' }}>{count}</Text>}
      </Animated.View>
    </TouchableOpacity>
  );
}

export function ReactionsBar({
  reactions, currentUserId, colors, onReact,
}: {
  reactions: { emoji: string; users: (string | { _id: string })[] }[];
  currentUserId: string; colors: any;
  onReact: (emoji: string) => void;
}) {
  if (!reactions?.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {reactions.map((r) => {
        const reacted = r.users.some((u) => (typeof u === 'string' ? u : u._id) === currentUserId);
        return (
          <AnimatedReactionPill
            key={r.emoji}
            emoji={r.emoji}
            count={r.users.length}
            reacted={reacted}
            colors={colors}
            onPress={onReact}
          />
        );
      })}
    </View>
  );
}

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
        width: 46, height: 46, borderRadius: 23,
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

export function QuickReactionRow({
  colors, selectedEmoji, onSelect,
}: {
  colors: any; selectedEmoji?: string; onSelect: (emoji: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, paddingVertical: 8 }}>
      {QUICK_REACTION_EMOJIS.map((emoji, idx) => (
        <BouncingEmoji
          key={emoji}
          emoji={emoji}
          delay={idx * 90}
          isSelected={selectedEmoji === emoji}
          onPress={onSelect}
          colors={colors}
        />
      ))}
    </View>
  );
}

// Mismo theming de rn-emoji-keyboard que usa el chat, mapeado a `colors`.
export function emojiPickerTheme(colors: any) {
  return {
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
  };
}
