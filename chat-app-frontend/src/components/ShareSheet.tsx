import { View, Text, TouchableOpacity, Image, Modal, Pressable, Share, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

// Base de la API (chat-backend) y base de la web, derivada de ella
// (api.holyholyholy.es -> holyholyholy.es).
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
export const WEB_URL = API_URL.replace('://api.', '://');

type Props = {
  visible: boolean;
  onClose: () => void;
  url: string;          // enlace a compartir (p. ej. https://holyholyholy.es/u/<id>)
  title: string;        // encabezado del modal
  message?: string;     // texto que acompaña al enlace al compartir
};

/**
 * Hoja inferior para compartir un enlace con QR (estilo WhatsApp).
 * El QR lo genera el backend (/public/qr) porque la app no tiene librería
 * de QR nativa. El botón "Compartir enlace" usa el menú nativo del sistema.
 */
export default function ShareSheet({ visible, onClose, url, title, message }: Props) {
  const { colors } = useTheme();
  const [qrLoading, setQrLoading] = useState(true);

  const qrUrl = `${API_URL}/public/qr?size=500&data=${encodeURIComponent(url)}`;

  const handleShare = async () => {
    try {
      await Share.share({ message: message ? `${message}\n${url}` : url, url, title });
    } catch {
      /* el usuario canceló */
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                <Ionicons name="share-social" size={20} color={colors.accent} style={{ marginRight: 8 }} />
                <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', flex: 1 }}>{title}</Text>
                <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* QR */}
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View style={{ backgroundColor: '#fff', padding: 14, borderRadius: 16 }}>
                  <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
                    {qrLoading && <ActivityIndicator color="#111" style={{ position: 'absolute' }} />}
                    <Image
                      source={{ uri: qrUrl }}
                      style={{ width: 200, height: 200 }}
                      onLoadEnd={() => setQrLoading(false)}
                    />
                  </View>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 12 }}>Escanea para abrir</Text>
              </View>

              {/* Enlace */}
              <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>{url}</Text>
              </View>

              {/* Compartir */}
              <TouchableOpacity
                onPress={handleShare}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, gap: 8 }}
              >
                <Ionicons name="share-outline" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Compartir enlace</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
