import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

// "Colores de la pantalla" del menú ⋯ de la Biblia: cambiar el tema de TODA la
// app sin salir del lector. Espejo de `AppThemeSheet` de la web
// (ReadingMenuSheet.jsx); allí son los temas de daisyUI, aquí la app solo tiene
// claro y oscuro (ThemeContext), así que son dos opciones. Es el mismo
// interruptor de Ajustes → Apariencia.
interface Props {
  visible: boolean;
  bottomInset: number;
  onClose: () => void;
}

const OPTIONS = [
  { id: 'light', label: 'Claro', icon: 'sunny' as const, bg: '#FFFFFF', fg: '#111B21', bar: '#25D366' },
  { id: 'dark', label: 'Oscuro', icon: 'moon' as const, bg: '#0B141A', fg: '#E9EDEF', bar: '#3B82F6' },
];

export function AppThemeSheet({ visible, bottomInset, onClose }: Props) {
  const { colors, isDark, toggleTheme } = useTheme();
  const current = isDark ? 'dark' : 'light';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <View style={{
            backgroundColor: colors.bgSecondary,
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            paddingBottom: bottomInset + 16,
          }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />

            <View style={{ paddingHorizontal: 20 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>Colores de la pantalla</Text>
              <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 2, marginBottom: 14 }}>
                Cambia los colores de toda la app.
              </Text>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                {OPTIONS.map((o) => {
                  const on = o.id === current;
                  return (
                    <TouchableOpacity
                      key={o.id}
                      onPress={() => { if (!on) toggleTheme(); }}
                      style={{
                        flex: 1, padding: 8, borderRadius: 14, alignItems: 'center', gap: 8,
                        backgroundColor: on ? colors.bgTertiary : 'transparent',
                        borderWidth: 2, borderColor: on ? colors.accent : colors.border,
                      }}
                    >
                      {/* Muestra en miniatura del tema */}
                      <View style={{ width: '100%', height: 56, borderRadius: 10, backgroundColor: o.bg, padding: 8, gap: 6, borderWidth: 1, borderColor: colors.border }}>
                        <View style={{ width: '70%', height: 8, borderRadius: 4, backgroundColor: o.fg, opacity: 0.8 }} />
                        <View style={{ width: '45%', height: 8, borderRadius: 4, backgroundColor: o.fg, opacity: 0.4 }} />
                        <View style={{ width: '55%', height: 8, borderRadius: 4, backgroundColor: o.bar }} />
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name={o.icon} size={15} color={on ? colors.accent : colors.textSecondary} />
                        <Text style={{ color: on ? colors.accent : colors.textPrimary, fontWeight: '600', fontSize: 14 }}>{o.label}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={{ marginHorizontal: 20, marginTop: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
