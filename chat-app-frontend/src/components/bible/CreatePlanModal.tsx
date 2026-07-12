import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

// Crear un plan de lectura propio (#D): rango de libros + días.
//
// El plan se referencia por ÍNDICE de libro (0–65, orden canónico), que es lo
// que espera el backend: así el plan vale para cualquier versión.
//
// Todo el formulario vive aquí; la pantalla solo recibe el plan a crear.
export interface CustomPlanDraft {
  title: string;
  bookStart: number;
  bookEnd: number;
  days: number;
}

interface Props {
  visible: boolean;
  // Libros en orden canónico de la versión activa (para el selector).
  books: string[];
  saving: boolean;
  colors: any;
  bottomInset: number;
  onClose: () => void;
  onCreate: (draft: CustomPlanDraft) => void;
}

export function CreatePlanModal({
  visible,
  books,
  saving,
  colors,
  bottomInset,
  onClose,
  onCreate,
}: Props) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(65);
  const [days, setDays] = useState('30');
  const [pickerFor, setPickerFor] = useState<null | 'start' | 'end'>(null);

  const bookField = (label: string, index: number, which: 'start' | 'end') => (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <TouchableOpacity
        onPress={() => setPickerFor(which)}
        style={{
          backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1,
          borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 11,
        }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 14 }} numberOfLines={1}>
          {books[index] ?? '—'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{
          backgroundColor: colors.bgSecondary,
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          paddingBottom: bottomInset + 16, paddingHorizontal: 20,
        }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 14 }}>
            Crear mi plan
          </Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Nombre del plan"
            placeholderTextColor={colors.inputPlaceholder}
            style={{
              backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1,
              borderColor: colors.border, color: colors.inputText,
              paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12,
            }}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            {bookField('Desde', start, 'start')}
            {bookField('Hasta', end, 'end')}
          </View>

          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Días</Text>
          <TextInput
            value={days}
            onChangeText={setDays}
            keyboardType="number-pad"
            placeholder="30"
            placeholderTextColor={colors.inputPlaceholder}
            style={{
              backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1,
              borderColor: colors.border, color: colors.inputText,
              paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 16,
            }}
          />

          <TouchableOpacity
            onPress={() =>
              onCreate({
                title: title.trim() || 'Mi plan',
                bookStart: start,
                bookEnd: end,
                days: Math.max(1, parseInt(days, 10) || 1),
              })
            }
            disabled={saving}
            style={{
              paddingVertical: 14, borderRadius: 14, backgroundColor: colors.accent,
              alignItems: 'center', marginBottom: 8, opacity: saving ? 0.6 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Crear plan</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 15 }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Selector de libro (inicial o final) */}
      <Modal visible={pickerFor !== null} transparent animationType="fade" onRequestClose={() => setPickerFor(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}
          onPress={() => setPickerFor(null)}
        >
          <Pressable
            onPress={() => {}}
            style={{ backgroundColor: colors.bgSecondary, borderRadius: 16, maxHeight: '70%', overflow: 'hidden' }}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 15, padding: 16 }}>
              {pickerFor === 'start' ? 'Libro inicial' : 'Libro final'}
            </Text>
            <FlatList
              data={books}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  onPress={() => {
                    if (pickerFor === 'start') setStart(index);
                    else setEnd(index);
                    setPickerFor(null);
                  }}
                  style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}
