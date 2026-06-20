import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';

export default function QuienesSomosScreen() {
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
          Quiénes somos
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>

        {/* Logo / símbolo */}
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <View style={{
            width: 90, height: 90, borderRadius: 45,
            backgroundColor: colors.accent,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <Text style={{ fontSize: 44 }}>✝️</Text>
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '800', textAlign: 'center' }}>
            HolyChat
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 6, textAlign: 'center' }}>
            Comunidad cristiana digital
          </Text>
        </View>

        {/* Misión */}
        <View style={{ marginBottom: 24, padding: 18, borderRadius: 14, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Ionicons name="flag" size={20} color={colors.accent} style={{ marginRight: 10 }} />
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>Nuestra misión</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22 }}>
            Conectar a creyentes de todo el mundo en un espacio seguro, amoroso y edificante donde puedan crecer espiritualmente, orar juntos, compartir la Palabra y apoyarse mutuamente en la fe.
          </Text>
        </View>

        {/* Visión */}
        <View style={{ marginBottom: 24, padding: 18, borderRadius: 14, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Ionicons name="eye" size={20} color={colors.accent} style={{ marginRight: 10 }} />
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>Nuestra visión</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22 }}>
            Ser la comunidad cristiana digital de referencia en el mundo hispano: un lugar donde la tecnología está al servicio del Evangelio y donde cada función de la app está diseñada para fortalecer la vida espiritual de sus usuarios.
          </Text>
        </View>

        {/* Valores */}
        <View style={{ marginBottom: 24, padding: 18, borderRadius: 14, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <Ionicons name="heart" size={20} color={colors.accent} style={{ marginRight: 10 }} />
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>Nuestros valores</Text>
          </View>
          {[
            { icon: '🙏', label: 'Fe', desc: 'Todo lo que hacemos parte de nuestra confianza en Cristo.' },
            { icon: '❤️', label: 'Amor', desc: 'Tratamos a cada miembro como un hermano en la fe.' },
            { icon: '🤝', label: 'Comunidad', desc: 'Somos más fuertes juntos que separados.' },
            { icon: '📖', label: 'Palabra', desc: 'La Biblia es nuestra guía y autoridad espiritual.' },
            { icon: '🛡️', label: 'Integridad', desc: 'Transparencia y honestidad en todo lo que hacemos.' },
            { icon: '🌱', label: 'Crecimiento', desc: 'Buscamos madurez espiritual personal y comunitaria.' },
          ].map((v) => (
            <View key={v.label} style={{ flexDirection: 'row', marginBottom: 12 }}>
              <Text style={{ fontSize: 20, marginRight: 12, marginTop: 1 }}>{v.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>{v.label}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>{v.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Historia */}
        <View style={{ marginBottom: 24, padding: 18, borderRadius: 14, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Ionicons name="book" size={20} color={colors.accent} style={{ marginRight: 10 }} />
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>Nuestra historia</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22 }}>
            HolyChat nació del deseo de crear un espacio de comunicación cristiana que fuera más allá del simple chat. Queríamos una plataforma donde la fe fuera el centro: donde puedas comprometerte con disciplinas espirituales, leer la Biblia, compartir peticiones de oración y dar ofrendas, todo desde un mismo lugar.{'\n\n'}
            Somos un equipo pequeño con un corazón grande, convencidos de que la tecnología puede ser una poderosa herramienta para extender el Reino de Dios.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
