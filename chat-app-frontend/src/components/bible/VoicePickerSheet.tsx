import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, Platform, Linking, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { voiceLabel, type NativeVoice } from '../../lib/voiceRank';

// Elegir la voz de la lectura en voz alta. Se abre desde la barra de
// reproducción, así que mientras suena: tocar una voz la aplica al versículo
// actual (se repite con ella) y elegir es a la vez escuchar.
//
// "Automática" = la mejor según voiceRank. Es la opción de serie y la que se
// recomienda: si el teléfono instala una voz mejor más adelante, se usa sola.
interface Props {
  visible: boolean;
  voices: NativeVoice[]; // ya ordenadas de mejor a peor
  voicePref: string | null;
  colors: any;
  bottomInset: number;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

// Abrir los ajustes de texto a voz del sistema para descargar voces mejores.
async function openTtsSettings() {
  try {
    if (Platform.OS === 'android') await Linking.sendIntent('com.android.settings.TTS_SETTINGS');
    else await Linking.openSettings();
  } catch {
    Linking.openSettings().catch(() => {});
  }
}

export function VoicePickerSheet({ visible, voices, voicePref, colors, bottomInset, onSelect, onClose }: Props) {
  const { height: screenH } = useWindowDimensions();
  const best = voices[0] ? voiceLabel(voices[0], voices) : null;

  const row = (key: string, title: string, detail: string, active: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 20, paddingVertical: 13,
        borderBottomWidth: 1, borderBottomColor: colors.borderLight,
        backgroundColor: active ? colors.accent + '15' : 'transparent',
      }}
    >
      <Ionicons name="mic-outline" size={18} color={active ? colors.accent : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: active ? '700' : '500' }}>{title}</Text>
        {!!detail && <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{detail}</Text>}
      </View>
      {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <View style={{
            backgroundColor: colors.bgSecondary,
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            paddingBottom: bottomInset + 16,
          }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 }} />
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginVertical: 12 }}>
              Voz de lectura
            </Text>

            {/* Hasta 40-60 voces en algunos Android: scroll propio y acotado. */}
            <ScrollView style={{ maxHeight: screenH * 0.55 }}>
              {row(
                'auto',
                'Automática (recomendada)',
                best ? [`Ahora: ${best.title}`, best.detail].filter(Boolean).join(' · ') : 'La voz por defecto del teléfono',
                !voicePref,
                () => onSelect(null),
              )}
              {voices.map((v) => {
                const { title, detail } = voiceLabel(v, voices);
                return row(v.identifier, title, detail, voicePref === v.identifier, () => onSelect(v.identifier));
              })}
              {voices.length === 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 13, padding: 20, textAlign: 'center' }}>
                  Este teléfono no informa de sus voces. Se usa la de por defecto.
                </Text>
              )}
            </ScrollView>

            {/* Lo que de verdad cambia el sonido: muchos teléfonos traen solo la
                voz básica y las buenas hay que descargarlas (gratis). */}
            <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
                {Platform.OS === 'android'
                  ? '¿Todas suenan robóticas? En Ajustes → Texto a voz → Motor de Google → Instalar datos de voz, descarga el español con calidad alta.'
                  : '¿Todas suenan robóticas? En Ajustes → Accesibilidad → Contenido leído → Voces → Español, descarga una voz "Mejorada" o "Premium".'}
              </Text>
              <TouchableOpacity onPress={openTtsSettings} style={{ marginTop: 8 }}>
                <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>Abrir ajustes de voz</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={{ marginHorizontal: 20, marginTop: 14, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
