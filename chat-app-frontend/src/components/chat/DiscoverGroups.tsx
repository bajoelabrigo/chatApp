import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import type { DiscoverableGroup } from '../../services/conversationService';

// "Descubre grupos": grupos abiertos a los que se puede pedir entrar.
//
// Hasta ahora a un grupo solo se entraba si un admin te metía o si alguien te
// pasaba un enlace. La maquinaria de solicitud + aprobación ya existía entera;
// lo que no había era forma de ENCONTRAR un grupo, y por eso no crecían.
//
// Solo aparecen los que su admin marcó como visibles. Los grupos privados —donde
// se comparten peticiones de oración muy personales— siguen sin salir aquí.

interface Props {
  groups: DiscoverableGroup[];
  busyId: string | null;
  colors: any;
  onJoin: (g: DiscoverableGroup) => void;
}

export function DiscoverGroups({ groups, busyId, colors, onJoin }: Props) {
  if (groups.length === 0) return null;

  return (
    <View
      style={{
        backgroundColor: colors.bgSecondary,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 8,
      }}
    >
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 12,
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingHorizontal: 16,
          marginBottom: 4,
        }}
      >
        Descubre grupos
      </Text>

      {groups.map((g) => {
        // Ya pedí entrar: el botón lo DICE, en vez de invitarme otra vez. Sin esto
        // el usuario pulsa una y otra vez sin entender por qué no pasa nada.
        const pending = g.requestPending;
        const busy = busyId === g._id;

        return (
          <View
            key={g._id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            {g.groupAvatar ? (
              <Image source={{ uri: g.groupAvatar }} style={{ width: 50, height: 50, borderRadius: 12 }} />
            ) : (
              <View
                style={{
                  width: 50, height: 50, borderRadius: 12,
                  backgroundColor: colors.avatarBg,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <FontAwesome5 name="user-friends" size={18} color={colors.accent} />
              </View>
            )}

            <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
              <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}>
                {g.groupName}
              </Text>
              <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                {g.groupDescription
                  ? g.groupDescription
                  : `${g.memberCount} miembro${g.memberCount === 1 ? '' : 's'}`}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => !pending && !busy && onJoin(g)}
              disabled={pending || busy}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 18,
                backgroundColor: pending ? colors.bgTertiary : colors.accent,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {pending && <Ionicons name="time-outline" size={13} color={colors.textMuted} />}
              <Text
                style={{
                  color: pending ? colors.textMuted : '#fff',
                  fontSize: 12,
                  fontWeight: '700',
                }}
              >
                {pending ? 'Pendiente' : g.requiresApproval ? 'Pedir unirse' : 'Unirme'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}
