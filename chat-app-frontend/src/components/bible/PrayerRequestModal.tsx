import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { DatePickerModal } from '../DatePickerModal';
import type { VerseItem } from '../../constants/bible';
import type { Conversation } from '../../services/conversationService';

// Pedir oración por un versículo. Las peticiones cuelgan de un GRUPO (mismo
// sistema que el chat), así que hay que elegir uno; el versículo se adjunta al
// final del texto que escriba el usuario.
//
// Los campos son los mismos que los de "Nueva petición" del grupo: texto, fecha
// límite, foto y anónimo. Todo el estado del formulario vive aquí; la pantalla
// solo recibe el resultado.
//
// KeyboardAvoidingView como wrapper MÁS EXTERNO: si va dentro del backdrop, el
// maxHeight no tiene referencia de altura y el modal queda cortado.
export interface PrayerSubmission {
  groupId: string;
  text: string;
  isAnonymous: boolean;
  shareToFeed: boolean;
  deadline?: string;
  image: ImagePicker.ImagePickerAsset | null;
}

interface Props {
  verse: VerseItem | null;
  groups: Conversation[];
  colors: any;
  bottomInset: number;
  onClose: () => void;
  onSubmit: (data: PrayerSubmission) => Promise<void>;
}

export function PrayerRequestModal({
  verse,
  groups,
  colors,
  bottomInset,
  onClose,
  onSubmit,
}: Props) {
  const [text, setText] = useState('');
  const [groupId, setGroupId] = useState<string | null>(groups[0]?._id ?? null);
  const [anonymous, setAnonymous] = useState(false);
  // Por defecto la petición aparece en la comunidad (posts). Una petición anónima
  // nunca se publica, así que ahí la opción no aplica.
  const [shareToFeed, setShareToFeed] = useState(true);
  const [deadline, setDeadline] = useState<string | undefined>(undefined);
  const [datePicker, setDatePicker] = useState(false);
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving, setSaving] = useState(false);

  if (!verse) return null;

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para adjuntar fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) setImage(result.assets[0]);
  };

  const submit = async () => {
    if (!groupId || !text.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit({ groupId, text: text.trim(), isAnonymous: anonymous, shareToFeed, deadline, image });
    } finally {
      setSaving(false);
    }
  };

  const disabled = saving || !text.trim() || !groupId;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={onClose}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.bgSecondary,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              maxHeight: '92%',
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: bottomInset + 24 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>
                Pedir oración por este versículo
              </Text>

              {/* El versículo va fijo: se adjunta al final de la petición */}
              <View style={{
                marginTop: 14, padding: 12, borderRadius: 12,
                backgroundColor: colors.bgTertiary,
                borderLeftWidth: 3, borderLeftColor: colors.accent,
              }}>
                <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>
                  “{verse.text}”
                </Text>
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700', marginTop: 6 }}>
                  {verse.book} {verse.chapter}:{verse.verse}
                </Text>
              </View>

              {groups.length === 0 ? (
                <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 20, fontSize: 14 }}>
                  Las peticiones se publican en un grupo, y todavía no estás en ninguno.
                </Text>
              ) : (
                <>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 18, marginBottom: 6 }}>
                    TU PETICIÓN
                  </Text>
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    multiline
                    autoFocus
                    placeholder="¿Por qué quieres que oren contigo?"
                    placeholderTextColor={colors.inputPlaceholder}
                    style={{
                      backgroundColor: colors.inputBg, color: colors.inputText,
                      borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                      padding: 12, minHeight: 90, textAlignVertical: 'top', fontSize: 15,
                    }}
                  />

                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 18, marginBottom: 8 }}>
                    PUBLICAR EN
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {groups.map((g) => {
                      const active = groupId === g._id;
                      return (
                        <TouchableOpacity
                          key={g._id}
                          onPress={() => setGroupId(g._id)}
                          style={{
                            paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18,
                            backgroundColor: active ? colors.accent : colors.bgTertiary,
                            borderWidth: 1, borderColor: active ? colors.accent : colors.border,
                          }}
                        >
                          <Text style={{
                            color: active ? '#fff' : colors.textSecondary,
                            fontSize: 13, fontWeight: '600',
                          }}>
                            {g.groupName ?? 'Grupo'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Fecha límite (opcional) — mismo DatePickerModal del grupo */}
                  <TouchableOpacity
                    onPress={() => setDatePicker(true)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18,
                      paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
                      backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border,
                    }}
                  >
                    <Ionicons name="calendar-outline" size={18} color={colors.accent} />
                    <Text style={{ color: deadline ? colors.textPrimary : colors.textMuted, fontSize: 14, flex: 1 }}>
                      {deadline
                        ? `Hasta el ${new Date(deadline).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`
                        : 'Fecha límite (opcional)'}
                    </Text>
                    {deadline && (
                      <TouchableOpacity onPress={() => setDeadline(undefined)} hitSlop={10}>
                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>

                  {/* Foto (opcional) */}
                  <TouchableOpacity
                    onPress={pickImage}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
                      paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
                      backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border,
                    }}
                  >
                    <Ionicons name="image-outline" size={18} color={colors.accent} />
                    <Text style={{ color: image ? colors.textPrimary : colors.textMuted, fontSize: 14, flex: 1 }}>
                      {image ? 'Foto adjunta' : 'Adjuntar foto (opcional)'}
                    </Text>
                    {image && (
                      <TouchableOpacity onPress={() => setImage(null)} hitSlop={10}>
                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>

                  {image && (
                    <Image
                      source={{ uri: image.uri }}
                      style={{ width: '100%', height: 160, borderRadius: 12, marginTop: 10 }}
                      resizeMode="cover"
                    />
                  )}

                  <TouchableOpacity
                    onPress={() => setAnonymous((a) => !a)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 }}
                  >
                    <Ionicons
                      name={anonymous ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={anonymous ? colors.accent : colors.textMuted}
                    />
                    <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                      Publicar como anónimo
                    </Text>
                  </TouchableOpacity>

                  {/* Aparecer en la comunidad (posts). Por defecto sí; se
                      desactiva si la petición es anónima (esas no se publican). */}
                  <TouchableOpacity
                    onPress={() => !anonymous && setShareToFeed((s) => !s)}
                    disabled={anonymous}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, opacity: anonymous ? 0.5 : 1 }}
                  >
                    <Ionicons
                      name={shareToFeed && !anonymous ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={shareToFeed && !anonymous ? colors.accent : colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                        Que aparezca en la comunidad
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
                        {anonymous
                          ? 'Las peticiones anónimas no se publican'
                          : 'Se crea un post para que más personas oren contigo'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={submit}
                    disabled={disabled}
                    style={{
                      marginTop: 22, paddingVertical: 14, borderRadius: 24,
                      alignItems: 'center',
                      backgroundColor: colors.accent,
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                      {saving ? 'Publicando…' : 'Publicar petición'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={datePicker}
        title="Fecha límite de oración"
        value={deadline}
        onConfirm={(iso: string) => { setDeadline(iso); setDatePicker(false); }}
        onClose={() => setDatePicker(false)}
        colors={colors}
      />
    </Modal>
  );
}
