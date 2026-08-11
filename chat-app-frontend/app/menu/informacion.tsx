import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';

export default function InformacionScreen() {
  const { colors } = useTheme();

  const cardStyle = {
    marginTop: 16, marginHorizontal: 16, borderRadius: 16,
    overflow: 'hidden' as const, backgroundColor: colors.bgSecondary,
    borderWidth: 1, borderColor: colors.border,
  };

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
          Información
        </Text>
      </View>

      <View style={cardStyle}>
        <SectionRow icon="📜" label="Reglamentos" onPress={() => router.push('/info/reglamentos' as any)} colors={colors} />
        <SectionRow icon="❓" label="Preguntas frecuentes" onPress={() => router.push('/info/faq' as any)} colors={colors} />
        <SectionRow icon="✝️" label="Quiénes somos" onPress={() => router.push('/info/quienes-somos' as any)} colors={colors} />
        <SectionRow icon="📧" label="Contacto" onPress={() => router.push('/info/contacto' as any)} colors={colors} last />
      </View>
    </SafeAreaView>
  );
}

function SectionRow({ icon, label, onPress, colors, last }: {
  icon: string; label: string; onPress: () => void; colors: any; last?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 20, marginRight: 14 }}>{icon}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 16, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
    </TouchableOpacity>
  );
}
