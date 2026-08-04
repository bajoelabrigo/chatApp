import { View, Text, Image, Modal, Pressable, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatUser } from '../../services/conversationService';
import { cld } from '../../lib/cldImage';

// Hoja de un miembro del grupo: su ficha y lo que se puede hacer con él.
//
// Vivía dentro de `app/chat/[id].tsx` (2.200 líneas) como 130 líneas de JSX
// anidado con un IIFE dentro del render. Aquí se lee de un vistazo, y las reglas
// de quién ve qué quedan a la vista en vez de escondidas entre estilos.

interface Props {
  member: ChatUser | null;
  /** ¿El miembro que se está mirando es admin del grupo? */
  memberIsAdmin: boolean;
  /** ¿Soy admin? De ello depende ver las acciones de moderación. */
  iAmAdmin: boolean;
  /** ¿El miembro soy yo? Conmigo mismo no hay nada que hacer aquí. */
  isMe: boolean;
  loading: boolean;
  colors: any;
  bottomInset: number;
  onClose: () => void;
  onMessage: () => void;
  onCall: (type: 'audio' | 'video') => void;
  onInfo: () => void;
  onToggleAdmin: () => void;
  onRemove: () => void;
}

export function GroupMemberSheet({
  member,
  memberIsAdmin,
  iAmAdmin,
  isMe,
  loading,
  colors,
  bottomInset,
  onClose,
  onMessage,
  onCall,
  onInfo,
  onToggleAdmin,
  onRemove,
}: Props) {
  if (!member) return null;

  // Las tres acciones rápidas. Solo con OTRO miembro: escribirse o llamarse a uno
  // mismo no significa nada.
  const quickActions = [
    { icon: 'chatbubble-outline' as const, label: 'Mensaje', onPress: onMessage },
    { icon: 'call-outline' as const, label: 'Llamar', onPress: () => onCall('audio') },
    { icon: 'videocam-outline' as const, label: 'Video', onPress: () => onCall('video') },
  ];

  const row = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        // Con una acción en curso NO se cierra al tocar fuera: el usuario perdería
        // de vista una operación que ya está corriendo (quitar del grupo, por ej.).
        onPress={() => !loading && onClose()}
      >
        <Pressable onPress={() => {}}>
          <View
            style={{
              backgroundColor: colors.actionSheetBg,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingBottom: bottomInset + 12,
            }}
          >
            <View style={{ alignItems: 'center', paddingTop: 10 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                zIndex: 10,
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.bgTertiary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Ficha: avatar con anillo, nombre, correo y la etiqueta de admin. */}
            <View style={{ alignItems: 'center', paddingTop: 20, paddingBottom: 12 }}>
              <View style={{ padding: 3, borderRadius: 50, borderWidth: 2.5, borderColor: colors.accent }}>
                {member.avatar ? (
                  <Image source={{ uri: cld(member.avatar, 72) }} style={{ width: 72, height: 72, borderRadius: 36 }} />
                ) : (
                  <View
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 36,
                      backgroundColor: colors.avatarBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.accent, fontSize: 28, fontWeight: '700' }}>
                      {member.name[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: 14 }}>
                {member.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 3 }}>{member.email}</Text>

              {memberIsAdmin && (
                <View
                  style={{
                    marginTop: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    borderRadius: 10,
                    backgroundColor: colors.accent + '20',
                    borderWidth: 1,
                    borderColor: colors.accent + '40',
                  }}
                >
                  <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>Admin</Text>
                </View>
              )}
            </View>

            {!isMe && (
              <View style={{ flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 12 }}>
                {quickActions.map(({ icon, label, onPress }) => (
                  <TouchableOpacity
                    key={label}
                    onPress={onPress}
                    disabled={loading}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 14,
                      borderRadius: 16,
                      backgroundColor: colors.bgTertiary,
                      borderWidth: 1,
                      borderColor: colors.border,
                      gap: 6,
                    }}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Ionicons name={icon} size={22} color={colors.accent} />
                    )}
                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '500' }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!isMe && (
              <TouchableOpacity onPress={onInfo} style={row}>
                <Ionicons
                  name="information-circle-outline"
                  size={22}
                  color={colors.textPrimary}
                  style={{ marginRight: 14 }}
                />
                <Text style={{ color: colors.textPrimary, fontSize: 16, flex: 1 }}>Info.</Text>
              </TouchableOpacity>
            )}

            {/* Moderación: solo un admin, y nunca sobre sí mismo. */}
            {iAmAdmin && !isMe && (
              <>
                <TouchableOpacity onPress={onToggleAdmin} disabled={loading} style={row}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={22}
                    color={colors.textPrimary}
                    style={{ marginRight: 14 }}
                  />
                  <Text style={{ color: colors.textPrimary, fontSize: 16, flex: 1 }}>
                    {memberIsAdmin ? 'Quitar como admin' : 'Designar como admin. del grupo'}
                  </Text>
                  {loading && <ActivityIndicator size="small" color={colors.accent} />}
                </TouchableOpacity>

                <TouchableOpacity onPress={onRemove} disabled={loading} style={row}>
                  <Ionicons
                    name="remove-circle-outline"
                    size={22}
                    color={colors.danger}
                    style={{ marginRight: 14 }}
                  />
                  <Text style={{ color: colors.danger, fontSize: 16, flex: 1 }}>Quitar del grupo</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
