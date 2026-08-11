import { Modal, Pressable, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';

// Mismo patrón Modal+Pressable+fila que usa el chat (app/chat/[id].tsx) y
// ajustes — no hay librería de bottom-sheet en el proyecto.
export function PostOptionsSheet({
  visible, onClose, isOwner, isSaved, onEdit, onDelete, onSave, onHide, onReport,
}: {
  visible: boolean;
  onClose: () => void;
  isOwner: boolean;
  isSaved: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onSave: () => void;
  onHide?: () => void;
  onReport?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const sheetStyle = {
    paddingBottom: insets.bottom + 8,
    backgroundColor: colors.actionSheetBg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 16,
  };
  const rowStyle = {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  };

  const Row = ({ icon, label, onPress, danger }: {
    icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void; danger?: boolean;
  }) => (
    <TouchableOpacity onPress={() => { onClose(); onPress?.(); }} style={rowStyle}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.textSecondary} style={{ marginRight: 14 }} />
      <Text style={{ color: danger ? colors.danger : colors.textPrimary, fontSize: 15 }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <View style={sheetStyle}>
            {isOwner && onEdit && <Row icon="pencil-outline" label="Editar" onPress={onEdit} />}
            <Row icon={isSaved ? 'bookmark' : 'bookmark-outline'} label={isSaved ? 'Quitar de guardados' : 'Guardar'} onPress={onSave} />
            {!isOwner && onHide && <Row icon="eye-off-outline" label="No me interesa" onPress={onHide} />}
            {!isOwner && onReport && <Row icon="flag-outline" label="Reportar" onPress={onReport} />}
            {isOwner && onDelete && <Row icon="trash-outline" label="Eliminar" onPress={onDelete} danger />}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
