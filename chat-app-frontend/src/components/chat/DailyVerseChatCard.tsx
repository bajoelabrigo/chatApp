import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GroupDailyVerse } from '../../services/bibleService';

// Tarjeta fija del "versículo del día" en el chat del grupo. Muestra el versículo
// (el mismo para todos ese día), un botón "Abrir en la Biblia" y una fila de
// reacciones COMPARTIDAS por el grupo (para comentarlo juntos). Se puede plegar.

const QUICK_EMOJIS = ['🙏', '❤️', '🔥', '🕊️', '🙌', '✨'];

interface Props {
  data: GroupDailyVerse;
  colors: any;
  onReact: (emoji: string) => void;
  onOpen: () => void;
}

export function DailyVerseChatCard({ data, colors, onReact, onOpen }: Props) {
  // Por defecto CERRADO (ocupa mucho espacio); el usuario lo abre si quiere.
  const [collapsed, setCollapsed] = useState(true);
  const { verse, reactions, myEmoji } = data;

  // Cuenta por emoji + quién reaccionó (para el tooltip/avatares).
  const grouped = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number; mine: boolean; names: string[] }>();
    for (const r of reactions) {
      const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, names: [] };
      g.count += 1;
      if (r.emoji === myEmoji) g.mine = true;
      g.names.push(r.name);
      map.set(r.emoji, g);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [reactions, myEmoji]);

  const ref = `${verse.book} ${verse.chapter}:${verse.verse}`;

  return (
    <View
      style={{
        backgroundColor: colors.bgSecondary,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: collapsed ? 10 : 12,
      }}
    >
      {/* Cabecera: título + referencia + plegar */}
      <TouchableOpacity
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        <Ionicons name="book" size={15} color={colors.accent} />
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>
          Versículo del día
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }} numberOfLines={1}>
          · {ref}
        </Text>
        {collapsed && grouped.length > 0 && (
          <Text style={{ fontSize: 13 }}>
            {grouped.slice(0, 3).map((g) => g.emoji).join('')}
          </Text>
        )}
        <Ionicons
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={16}
          color={colors.textMuted}
        />
      </TouchableOpacity>

      {!collapsed && (
        <>
          <Text
            style={{ color: colors.textPrimary, fontSize: 14.5, lineHeight: 21, marginTop: 8, fontStyle: 'italic' }}
          >
            “{verse.text}”
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
            — {verse.versionName}
          </Text>

          {/* Reacciones rápidas */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 }}>
            {QUICK_EMOJIS.map((e) => {
              const g = grouped.find((x) => x.emoji === e);
              const mine = myEmoji === e;
              return (
                <TouchableOpacity
                  key={e}
                  onPress={() => onReact(e)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 16,
                    borderWidth: 1,
                    borderColor: mine ? colors.accent : colors.border,
                    backgroundColor: mine ? colors.accent + '22' : colors.bgTertiary,
                  }}
                >
                  <Text style={{ fontSize: 14 }}>{e}</Text>
                  {!!g?.count && (
                    <Text style={{ color: mine ? colors.accent : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                      {g.count}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={onOpen}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto',
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
                backgroundColor: colors.accent,
              }}
            >
              <Ionicons name="book-outline" size={13} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Abrir</Text>
            </TouchableOpacity>
          </View>

          {/* Quién reaccionó (primeros avatares) — el dato social del grupo. */}
          {reactions.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <View style={{ flexDirection: 'row' }}>
                {reactions.slice(0, 5).map((r, i) =>
                  r.avatar ? (
                    <Image
                      key={r.userId}
                      source={{ uri: r.avatar }}
                      style={{ width: 20, height: 20, borderRadius: 10, marginLeft: i === 0 ? 0 : -6, borderWidth: 1, borderColor: colors.bgSecondary }}
                    />
                  ) : (
                    <View
                      key={r.userId}
                      style={{ width: 20, height: 20, borderRadius: 10, marginLeft: i === 0 ? 0 : -6, backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ fontSize: 9, color: colors.textSecondary }}>{r.name[0]?.toUpperCase()}</Text>
                    </View>
                  )
                )}
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {reactions.length === 1
                  ? `${reactions[0].name} reaccionó`
                  : `${reactions.length} personas reaccionaron`}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}
