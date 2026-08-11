import { Modal, Pressable, Image, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Visor a pantalla completa mínimo (sin zoom/pan) — no existía uno en el repo
// (el chat sale al navegador con Linking.openURL); para un feed social vale la
// pena quedarse dentro de la app.
export function ImageViewerModal({
  visible, url, onClose,
}: { visible: boolean; url?: string | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  if (!url) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }}
        onPress={onClose}
      >
        <Image source={{ uri: url }} style={{ width, height: height * 0.8 }} resizeMode="contain" />
        <TouchableOpacity
          onPress={onClose}
          style={{
            position: 'absolute', top: 48, right: 20,
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.15)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </Pressable>
    </Modal>
  );
}
