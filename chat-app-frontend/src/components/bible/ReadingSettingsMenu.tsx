import { View, Text, TouchableOpacity, Modal, Pressable, Platform } from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { MIN_FONT, MAX_FONT } from '../../constants/bible';
import type { ReadingTheme, ReadingFont } from '../../constants/bible';

// Menú de los tres puntos: ajustes de lectura (tamaño de letra, tema sepia y
// serifa) y accesos a favoritos, notas y planes.
interface Props {
  visible: boolean;
  fontSize: number;
  readingTheme: ReadingTheme;
  readingFont: ReadingFont;
  colors: any;
  bottomInset: number;
  onClose: () => void;
  onFontSize: (n: number) => void;
  onReadingTheme: (t: ReadingTheme) => void;
  onReadingFont: (f: ReadingFont) => void;
  onOpenFavorites: () => void;
  onOpenNotes: () => void;
  onOpenPlans: () => void;
}

export function ReadingSettingsMenu({
  visible,
  fontSize,
  readingTheme,
  readingFont,
  colors,
  bottomInset,
  onClose,
  onFontSize,
  onReadingTheme,
  onReadingFont,
  onOpenFavorites,
  onOpenNotes,
  onOpenPlans,
}: Props) {
  const row = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  };

  const segment = (on: boolean) => ({
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center' as const,
    backgroundColor: on ? colors.accent : colors.bgTertiary,
    borderWidth: 1,
    borderColor: on ? colors.accent : colors.border,
  });

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

            {/* Tamaño de letra */}
            <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }}>
                Tamaño de letra
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => onFontSize(fontSize - 1)}
                  disabled={fontSize <= MIN_FONT}
                  style={{
                    flex: 1, paddingVertical: 14, borderRadius: 14,
                    backgroundColor: colors.bgTertiary, alignItems: 'center',
                    borderWidth: 1, borderColor: colors.border,
                    opacity: fontSize <= MIN_FONT ? 0.35 : 1,
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>Aa−</Text>
                </TouchableOpacity>

                <View style={{ width: 52, alignItems: 'center' }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700' }}>{fontSize}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>pt</Text>
                </View>

                <TouchableOpacity
                  onPress={() => onFontSize(fontSize + 1)}
                  disabled={fontSize >= MAX_FONT}
                  style={{
                    flex: 1, paddingVertical: 14, borderRadius: 14,
                    backgroundColor: colors.bgTertiary, alignItems: 'center',
                    borderWidth: 1, borderColor: colors.border,
                    opacity: fontSize >= MAX_FONT ? 0.35 : 1,
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 19, fontWeight: '700' }}>Aa+</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: 3, backgroundColor: colors.bgTertiary, borderRadius: 2, marginTop: 16, overflow: 'hidden' }}>
                <View style={{
                  height: '100%',
                  width: `${((fontSize - MIN_FONT) / (MAX_FONT - MIN_FONT)) * 100}%`,
                  backgroundColor: colors.accent, borderRadius: 2,
                }} />
              </View>
            </View>

            {/* Tema de lectura y tipografía (para lectura larga) */}
            <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
                Lectura
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {([['default', 'Normal'], ['sepia', 'Sepia']] as const).map(([id, label]) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => onReadingTheme(id)}
                    style={segment(readingTheme === id)}
                  >
                    <Text style={{
                      color: readingTheme === id ? '#fff' : colors.textSecondary,
                      fontWeight: '600', fontSize: 14,
                    }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {([['sans', 'Sin serifa'], ['serif', 'Con serifa']] as const).map(([id, label]) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => onReadingFont(id)}
                    style={segment(readingFont === id)}
                  >
                    <Text style={{
                      color: readingFont === id ? '#fff' : colors.textSecondary,
                      fontWeight: '600', fontSize: 14,
                      fontFamily: id === 'serif' ? (Platform.OS === 'ios' ? 'Georgia' : 'serif') : undefined,
                    }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: colors.borderLight, marginHorizontal: 20, marginVertical: 12 }} />

            <TouchableOpacity onPress={() => { onClose(); onOpenFavorites(); }} style={row}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FBBF2422', alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesome5 name="star" size={18} color="#FBBF24" />
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 }}>Mis favoritos</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { onClose(); onOpenNotes(); }} style={row}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="create-outline" size={20} color={colors.accent} />
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 }}>
                Notas y resaltados
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { onClose(); onOpenPlans(); }} style={row}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="calendar" size={20} color={colors.accent} />
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 }}>Planes de lectura</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onClose}
              style={{ marginHorizontal: 20, marginTop: 4, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
