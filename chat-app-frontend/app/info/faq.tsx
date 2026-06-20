import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';

const faqs = [
  {
    q: '¿Qué es HolyChat?',
    a: 'HolyChat es una app de mensajería cristiana que combina chat grupal e individual con herramientas espirituales: actividades de oración, ayuno, vigilia, lectura bíblica, peticiones de oración y un lector de la Biblia en múltiples versiones.',
  },
  {
    q: '¿Cómo me registro?',
    a: 'Puedes registrarte con tu correo electrónico (recibirás un código de verificación) o con tu cuenta de Google. El registro es gratuito y tarda menos de un minuto.',
  },
  {
    q: '¿Puedo usar la app sin internet?',
    a: 'La mayoría de las funciones requieren conexión a internet. Sin embargo, la Biblia puede leerse una vez que los textos se han cargado previamente en pantalla.',
  },
  {
    q: '¿Cómo funcionan las actividades grupales?',
    a: 'Dentro de un grupo puedes crear actividades (ayuno, vigilia, oración, lectura bíblica, evangelismo). Los miembros del grupo pueden comprometerse a participar con un horario semanal y la app les enviará recordatorios automáticos.',
  },
  {
    q: '¿Cómo funciona el sistema de ofrendas?',
    a: 'Las ofrendas se realizan a través de PayPal de forma segura. Puedes hacer una ofrenda única o suscribirte mensualmente como Sembrador. Las ofrendas son completamente voluntarias y van al sostenimiento de la plataforma.',
  },
  {
    q: '¿Qué es un Sembrador?',
    a: 'Un Sembrador es un miembro que apoya económicamente la comunidad con una suscripción mensual. Existen tres niveles ($5, $10, $20 USD/mes). Ser Sembrador es una expresión de fe y generosidad.',
  },
  {
    q: '¿Cómo cancelo mi suscripción?',
    a: 'Puedes cancelar tu suscripción directamente desde tu cuenta de PayPal en cualquier momento. El acceso continúa hasta el final del período pagado.',
  },
  {
    q: '¿Mis mensajes son privados?',
    a: 'Los mensajes 1:1 son privados entre los dos participantes. Los mensajes en grupos son visibles para todos los miembros de ese grupo. No compartimos tus conversaciones con terceros.',
  },
  {
    q: '¿Cómo silencio o archivono una conversación?',
    a: 'Mantén pulsada la conversación en la lista de chats para ver las opciones: silenciar, archivar, fijar o añadir a favoritos.',
  },
  {
    q: '¿Puedo cambiar mi contraseña?',
    a: 'Sí, si te registraste con email ve a Ajustes → Editar perfil → Cambiar contraseña. Si usas Google Sign-In, la contraseña la gestiona Google.',
  },
  {
    q: '¿Cómo elimino mi cuenta?',
    a: 'Ve a Ajustes → Cuenta → Eliminar cuenta. Ten en cuenta que esta acción es permanente e irreversible: se borrarán todos tus datos, mensajes, actividades y compromisos.',
  },
  {
    q: '¿Cómo reporto a un usuario?',
    a: 'Abre el perfil del usuario y selecciona la opción "Reportar". Nuestro equipo revisará el caso y tomará las medidas necesarias.',
  },
  {
    q: '¿En qué versiones de la Biblia está disponible?',
    a: 'Actualmente la app incluye: Reina-Valera Antigua (RVA), Reina-Valera 1960 (RVR1960), King James Version (KJV) y World English Bible (WEB).',
  },
  {
    q: '¿Cómo activo las notificaciones?',
    a: 'Ve a Ajustes → Notificaciones y activa las que deseas. Asegúrate también de que las notificaciones estén habilitadas para HolyChat en los ajustes de tu dispositivo.',
  },
];

export default function FaqScreen() {
  const { colors } = useTheme();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

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
          Preguntas frecuentes
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
        {faqs.map((item, idx) => (
          <TouchableOpacity
            key={idx}
            activeOpacity={0.8}
            onPress={() => setOpenIndex(openIndex === idx ? null : idx)}
            style={{
              marginBottom: 10, borderRadius: 12,
              backgroundColor: colors.bgSecondary,
              borderWidth: 1, borderColor: colors.border,
              overflow: 'hidden',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600', flex: 1, lineHeight: 20 }}>
                {item.q}
              </Text>
              <Ionicons
                name={openIndex === idx ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textMuted}
              />
            </View>
            {openIndex === idx && (
              <View style={{ paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 12 }}>
                  {item.a}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
