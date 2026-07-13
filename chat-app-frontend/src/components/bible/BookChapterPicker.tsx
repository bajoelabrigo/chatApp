import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, TextInput, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fold } from '../../utils/textFold';

// Selector de Libro / Capítulo, siempre visible en la parte de arriba.
//
// El equivalente móvil de los desplegables de la web. Hacía falta porque en la
// app la lista de libros va DENTRO del FlatList, con las tarjetas de la portada
// como cabecera: para llegar a un libro había que pasar por delante del versículo
// del día, la tarjeta del grupo, continuar leyendo y la petición de oración. Para
// quien entra a buscar un pasaje concreto —que es la mayoría— eso son cuatro
// pantallas de scroll antes de empezar.
//
// La lista de libros de abajo sigue estando: quien prefiera navegar en vez de
// elegir, puede. Esto es un atajo, no un reemplazo.

interface Props {
  books: string[];
  chapters: string[];
  selectedBook: string | null;
  selectedChapter: string | null;
  colors: any;
  bottomInset: number;
  onPickBook: (book: string) => void;
  onPickChapter: (chapter: string) => void;
}

export function BookChapterPicker({
  books,
  chapters,
  selectedBook,
  selectedChapter,
  colors,
  bottomInset,
  onPickBook,
  onPickChapter,
}: Props) {
  const [open, setOpen] = useState<'book' | 'chapter' | null>(null);
  const [query, setQuery] = useState('');

  // Buscar sin tildes: escribir "genesis" tiene que encontrar "Génesis".
  const q = fold(query.trim());
  const visible = q ? books.filter((b) => fold(b).includes(q)) : books;

  const btn = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.bgTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  };

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: colors.bgPrimary,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        }}
      >
        <TouchableOpacity
          onPress={() => { setQuery(''); setOpen('book'); }}
          style={{ ...btn, flex: 1 }}
        >
          <Ionicons name="book-outline" size={16} color={colors.textMuted} />
          <Text
            numberOfLines={1}
            style={{ flex: 1, color: selectedBook ? colors.textPrimary : colors.textMuted, fontSize: 14, fontWeight: '600' }}
          >
            {selectedBook ?? 'Elegir libro'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </TouchableOpacity>

        {/* El capítulo no se puede elegir sin libro: el botón queda apagado. */}
        <TouchableOpacity
          onPress={() => selectedBook && chapters.length && setOpen('chapter')}
          disabled={!selectedBook || !chapters.length}
          style={{ ...btn, opacity: selectedBook && chapters.length ? 1 : 0.45, minWidth: 92 }}
        >
          <Text
            style={{ color: selectedChapter ? colors.textPrimary : colors.textMuted, fontSize: 14, fontWeight: '600' }}
          >
            {selectedChapter ? `Cap. ${selectedChapter}` : 'Cap.'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Modal visible={!!open} transparent animationType="slide" onRequestClose={() => setOpen(null)}>
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setOpen(null)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.bgSecondary,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '80%',
              paddingBottom: bottomInset,
            }}
          >
            <View
              style={{
                width: 40, height: 4, borderRadius: 2,
                backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 14,
              }}
            />

            {open === 'book' && (
              <>
                <View
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12,
                    backgroundColor: colors.inputBg, borderRadius: 12,
                    borderWidth: 1, borderColor: colors.border,
                  }}
                >
                  <Ionicons name="search" size={16} color={colors.textMuted} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    autoFocus
                    placeholder="Buscar un libro…"
                    placeholderTextColor={colors.inputPlaceholder}
                    style={{ flex: 1, color: colors.inputText, paddingVertical: 10, fontSize: 15 }}
                  />
                </View>

                <FlatList
                  data={visible}
                  keyExtractor={(b) => b}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => {
                        setOpen(null);
                        onPickBook(item);
                      }}
                      style={{
                        flexDirection: 'row', alignItems: 'center',
                        paddingHorizontal: 20, paddingVertical: 14,
                        borderBottomWidth: 1, borderBottomColor: colors.borderLight,
                      }}
                    >
                      <Text
                        style={{
                          flex: 1, fontSize: 16,
                          color: item === selectedBook ? colors.accent : colors.textPrimary,
                          fontWeight: item === selectedBook ? '700' : '400',
                        }}
                      >
                        {item}
                      </Text>
                      {item === selectedBook && (
                        <Ionicons name="checkmark" size={18} color={colors.accent} />
                      )}
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <Text style={{ color: colors.textMuted, textAlign: 'center', padding: 24 }}>
                      Ningún libro con ese nombre.
                    </Text>
                  }
                />
              </>
            )}

            {open === 'chapter' && (
              <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 8 }}>
                {chapters.map((ch) => (
                  <TouchableOpacity
                    key={ch}
                    onPress={() => {
                      setOpen(null);
                      onPickChapter(ch);
                    }}
                    style={{
                      width: 56, height: 56, borderRadius: 12,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: selectedChapter === ch ? colors.accent : colors.bgTertiary,
                      borderWidth: 1,
                      borderColor: selectedChapter === ch ? colors.accent : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16, fontWeight: '600',
                        color: selectedChapter === ch ? '#fff' : colors.textPrimary,
                      }}
                    >
                      {ch}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
