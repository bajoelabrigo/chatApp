import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';

const sections = [
  {
    title: '1. Propósito de la comunidad',
    body: 'HolyChat es un espacio de comunión cristiana diseñado para fortalecer la fe, fomentar la oración, el ayuno y el estudio bíblico en comunidad. Toda interacción debe estar orientada a edificar el cuerpo de Cristo.',
  },
  {
    title: '2. Respeto y amor fraternal',
    body: 'Se requiere un trato respetuoso, amoroso y edificante entre todos los miembros. Están prohibidos los insultos, la burla, la difamación, el lenguaje obsceno y cualquier forma de acoso, independientemente del medio (mensajes, imágenes, audios o documentos).',
  },
  {
    title: '3. Contenido permitido',
    body: 'Solo se permite compartir contenido que edifique: reflexiones bíblicas, testimonios, peticiones de oración, anuncios de actividades espirituales, música cristiana y contenido familiar apto para todas las edades.',
  },
  {
    title: '4. Contenido prohibido',
    body: 'Queda estrictamente prohibido compartir: contenido sexual o violento, material que contradiga los fundamentos bíblicos, propaganda política o partidista, información falsa o engañosa, publicidad no autorizada y cadenas o mensajes de spam.',
  },
  {
    title: '5. Privacidad y datos personales',
    body: 'Está prohibido divulgar información personal de otros usuarios (teléfonos, direcciones, fotos personales) sin su consentimiento explícito. Los datos de los usuarios se manejan con confidencialidad conforme a nuestra política de privacidad.',
  },
  {
    title: '6. Actividades espirituales',
    body: 'Los compromisos de ayuno, vigilia, oración y lectura bíblica son voluntarios. Cada miembro es responsable de sus compromisos ante Dios y la comunidad. No se permite presionar, obligar ni avergonzar a nadie por su nivel de participación.',
  },
  {
    title: '7. Ofrendas y donativos',
    body: 'Las ofrendas son completamente voluntarias y se realizan como un acto de fe personal. Nunca se presionará a nadie para dar. Los fondos recibidos se destinan al sostenimiento de la plataforma y proyectos comunitarios.',
  },
  {
    title: '8. Consecuencias por incumplimiento',
    body: 'El incumplimiento de estos reglamentos podrá resultar en advertencia, suspensión temporal o eliminación permanente de la cuenta, según la gravedad de la falta, a discreción del equipo administrador.',
  },
  {
    title: '9. Reporte de infracciones',
    body: 'Si observas una conducta que viola estos reglamentos, usa la opción "Reportar" disponible en el perfil del usuario o contacta al equipo de soporte a través de la sección Contacto.',
  },
  {
    title: '10. Modificaciones',
    body: 'Estos reglamentos pueden actualizarse. Se notificará a los usuarios ante cualquier cambio significativo. El uso continuado de la app implica la aceptación de los reglamentos vigentes.',
  },
];

export default function ReglamentosScreen() {
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
          Reglamentos
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24, lineHeight: 20 }}>
          Al usar HolyChat aceptas cumplir con las siguientes normas de convivencia comunitaria. Te pedimos leerlas con atención y compromiso.
        </Text>

        {sections.map((s) => (
          <View key={s.title} style={{ marginBottom: 22 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 6 }}>
              {s.title}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22 }}>
              {s.body}
            </Text>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
