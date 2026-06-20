import { View, Text, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';

const openUrl = async (url: string) => {
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  } else {
    Alert.alert('Error', 'No se pudo abrir el enlace');
  }
};

export default function ContactoScreen() {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        backgroundColor: colors.headerBg,
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', flex: 1 }}>
          Contacto
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>

        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginBottom: 28 }}>
          Estamos aquí para ayudarte. Si tienes alguna pregunta, sugerencia o necesitas soporte técnico, no dudes en contactarnos.
        </Text>

        {/* Correos */}
        <View style={{ marginBottom: 16, borderRadius: 14, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            Correo electrónico
          </Text>
          {[
            { label: 'Administración', address: 'admin@holyholyholy.es' },
            { label: 'Soporte general', address: 'bajoelabrigo@gmail.com' },
          ].map((item, idx) => (
            <TouchableOpacity
              key={item.address}
              onPress={() => openUrl(`mailto:${item.address}`)}
              style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 16, paddingVertical: 14,
                borderTopWidth: 1, borderTopColor: colors.border,
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                <Ionicons name="mail" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>{item.label}</Text>
                <Text style={{ color: colors.accent, fontSize: 13, marginTop: 2 }}>{item.address}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* WhatsApp */}
        <View style={{ marginBottom: 16, borderRadius: 14, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            WhatsApp
          </Text>
          <TouchableOpacity
            onPress={() => openUrl('https://wa.me/51968796029')}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
              <Ionicons name="logo-whatsapp" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>WhatsApp</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>+51 968 796 029</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* YouTube */}
        <View style={{ marginBottom: 16, borderRadius: 14, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            YouTube
          </Text>
          {[
            { handle: '@holyholyholy-es', url: 'https://www.youtube.com/@holyholyholy-es' },
            { handle: '@evangelistajorgeaguilar', url: 'https://www.youtube.com/@evangelistajorgeaguilar' },
          ].map((item) => (
            <TouchableOpacity
              key={item.handle}
              onPress={() => openUrl(item.url)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                <Ionicons name="logo-youtube" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>{item.handle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Instagram */}
        <View style={{ marginBottom: 16, borderRadius: 14, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            Instagram
          </Text>
          <TouchableOpacity
            onPress={() => openUrl('https://www.instagram.com/evangelistajorgeaguilar')}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#E1306C', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
              <Ionicons name="logo-instagram" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>@evangelistajorgeaguilar</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* TikTok */}
        <View style={{ marginBottom: 24, borderRadius: 14, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            TikTok
          </Text>
          <TouchableOpacity
            onPress={() => openUrl('https://www.tiktok.com/@evangelistajorgeaguilar')}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#010101', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
              <MaterialCommunityIcons name="music-note" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>@evangelistajorgeaguilar</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
          Tiempo de respuesta habitual: 24-48 horas hábiles.{'\n'}
          Respondemos en español.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
