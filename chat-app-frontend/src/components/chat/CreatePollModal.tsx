import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Crear una encuesta.
//
// Pensada para lo que los grupos ya hacen a mano: cuadrar ayunos, vigilias y
// escalas de oración contando mensajes ("¿quién puede el jueves de 6 a 7?").
//
// "Varias respuestas" está a un toque porque es el caso REAL más común aquí: la
// pregunta no suele ser "¿qué día?" sino "¿qué días PUEDES?".

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 12;

interface Props {
  colors: any;
  bottomInset: number;
  onClose: () => void;
  onCreate: (poll: { question: string; options: string[]; multiple: boolean }) => void;
}

export function CreatePollModal({ colors, bottomInset, onClose, onCreate }: Props) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);

  const setOption = (i: number, value: string) => {
    setOptions((prev) => prev.map((o, j) => (j === i ? value : o)));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  };

  const removeOption = (i: number) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, j) => j !== i));
  };

  // Se ignoran las opciones vacías: es normal dejar una casilla de más sin
  // rellenar, y no tiene sentido bloquear el botón por eso.
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const canCreate = question.trim().length > 0 && filled.length >= MIN_OPTIONS;

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
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '92%',
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: bottomInset + 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="stats-chart" size={20} color={colors.accent} />
                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', flex: 1 }}>
                  Nueva encuesta
                </Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <TextInput
                value={question}
                onChangeText={setQuestion}
                maxLength={200}
                placeholder="Pregunta (ej: ¿Qué días puedes orar?)"
                placeholderTextColor={colors.inputPlaceholder}
                style={{
                  marginTop: 16,
                  backgroundColor: colors.inputBg,
                  color: colors.inputText,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  fontSize: 16,
                }}
              />

              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginTop: 20,
                  marginBottom: 8,
                }}
              >
                Opciones
              </Text>

              {options.map((opt, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <TextInput
                    value={opt}
                    onChangeText={(v) => setOption(i, v)}
                    maxLength={100}
                    placeholder={`Opción ${i + 1}`}
                    placeholderTextColor={colors.inputPlaceholder}
                    style={{
                      flex: 1,
                      backgroundColor: colors.inputBg,
                      color: colors.inputText,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 15,
                    }}
                  />
                  {options.length > MIN_OPTIONS && (
                    <TouchableOpacity onPress={() => removeOption(i)} style={{ padding: 4 }}>
                      <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {options.length < MAX_OPTIONS && (
                <TouchableOpacity
                  onPress={addOption}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}
                >
                  <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 14 }}>
                    Añadir opción
                  </Text>
                </TouchableOpacity>
              )}

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: colors.bgTertiary,
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                    Varias respuestas
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    Cada uno puede marcar más de una opción (útil para "¿qué días puedes?").
                  </Text>
                </View>
                <Switch
                  value={multiple}
                  onValueChange={setMultiple}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor="#fff"
                />
              </View>

              <TouchableOpacity
                onPress={() =>
                  canCreate && onCreate({ question: question.trim(), options: filled, multiple })
                }
                disabled={!canCreate}
                style={{
                  marginTop: 20,
                  paddingVertical: 14,
                  borderRadius: 24,
                  alignItems: 'center',
                  backgroundColor: canCreate ? colors.accent : colors.bgTertiary,
                }}
              >
                <Text
                  style={{
                    color: canCreate ? '#fff' : colors.textMuted,
                    fontWeight: '700',
                    fontSize: 15,
                  }}
                >
                  Enviar encuesta
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
