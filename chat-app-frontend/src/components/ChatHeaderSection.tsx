import { View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export type ChatFilterType = 'all' | 'unread' | 'favorites' | 'groups';

interface ChatHeaderSectionProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeFilter: ChatFilterType;
  onFilterChange: (f: ChatFilterType) => void;
  unreadCount: number;
  favoritesCount: number;
  groupsCount: number;
  onMenuPress: () => void;
  onNewChatPress: () => void;
  onCameraPress: () => void;
  onNotificationsPress: () => void;
  notificationsCount: number;
}

export function ChatHeaderSection({
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  unreadCount,
  favoritesCount,
  groupsCount,
  onMenuPress,
  onNewChatPress,
  onCameraPress,
  onNotificationsPress,
  notificationsCount,
}: ChatHeaderSectionProps) {
  const { colors, isDark } = useTheme();

  const filters: { key: ChatFilterType; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: 0 },
    { key: 'unread', label: 'No leídos', count: unreadCount },
    { key: 'favorites', label: 'Favoritos', count: favoritesCount },
    { key: 'groups', label: 'Grupos', count: groupsCount },
  ];

  return (
    <View style={{ backgroundColor: colors.headerBg }}>
      {/* Top row: menu / camera / add */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 6,
      }}>
        <TouchableOpacity
          onPress={onMenuPress}
          style={{
            width: 42, height: 42, borderRadius: 21,
            backgroundColor: isDark ? '#2A2A2A' : '#F1F5F9',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            onPress={onNotificationsPress}
            style={{
              width: 42, height: 42, borderRadius: 21,
              borderWidth: 1.5,
              borderColor: isDark ? '#3F3F46' : colors.border,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
            {notificationsCount > 0 && (
              <View style={{
                position: 'absolute', top: -2, right: -2,
                minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
                backgroundColor: colors.danger,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: colors.headerBg,
              }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
                  {notificationsCount > 99 ? '99+' : notificationsCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onCameraPress}
            style={{
              width: 42, height: 42, borderRadius: 21,
              borderWidth: 1.5,
              borderColor: isDark ? '#3F3F46' : colors.border,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="camera-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onNewChatPress}
            style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: isDark ? '#F5F5F5' : colors.accent,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="add" size={26} color={isDark ? '#0A0A0A' : '#FFFFFF'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Title */}
      <Text style={{
        color: colors.textPrimary,
        fontSize: 34,
        fontWeight: '800',
        paddingHorizontal: 16,
        paddingBottom: 12,
        letterSpacing: -0.5,
      }}>
        Chats
      </Text>

      {/* Search bar */}
      <View style={{
        marginHorizontal: 16,
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? '#1C1C1C' : '#EAEEF4',
        borderRadius: 28,
        paddingHorizontal: 14,
        height: 44,
      }}>
        <Ionicons name="search" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={{ flex: 1, color: colors.inputText, fontSize: 16, paddingVertical: 0 }}
          placeholder="Buscar"
          placeholderTextColor={colors.inputPlaceholder}
          value={searchQuery}
          onChangeText={onSearchChange}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => onSearchChange('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexDirection: 'row' }}
      >
        {filters.map((f) => {
          const isActive = activeFilter === f.key;
          const label = f.count > 0 ? `${f.label} ${f.count}` : f.label;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => onFilterChange(f.key)}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: isActive
                  ? (isDark ? '#3F3F46' : colors.accent)
                  : (isDark ? '#1A1A1A' : '#F1F5F9'),
                borderWidth: 1,
                borderColor: isDark
                  ? (isActive ? '#52525B' : '#2E2E2E')
                  : (isActive ? colors.accent : colors.border),
              }}
            >
              <Text style={{
                color: isActive
                  ? (isDark ? '#F5F5F5' : '#FFFFFF')
                  : colors.textSecondary,
                fontWeight: isActive ? '700' : '500',
                fontSize: 14,
              }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
