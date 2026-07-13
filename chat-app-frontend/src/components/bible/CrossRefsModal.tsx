import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchVerseXrefs } from '../../services/bibleService';
import type { CrossRef } from '../../services/bibleService';
import type { VerseItem } from '../../constants/bible';

// Referencias cruzadas de un versículo: los pasajes que hablan de lo mismo.
//
// El dataset (openbible.info, CC-BY, derivado del Treasury of Scripture
// Knowledge) son solo punteros; el TEXTO que se ve aquí sale de nuestra versión
// activa, que el backend ya resuelve. Por eso basta UNA petición para pintar el
// panel entero.
//
// Vive en el servidor: sin conexión no hay referencias (el servicio devuelve
// null y aquí se muestra el aviso, no un error).

interface Props {
  verse: VerseItem | null;
  token: string;
  version: string;
  colors: any;
  bottomInset: number;
  onClose: () => void;
  /** Navegar al pasaje tocado. La pantalla decide cómo (cambia libro/capítulo y resalta). */
  onOpenRef: (ref: CrossRef) => void;
}

export function CrossRefsModal({
  verse,
  token,
  version,
  colors,
  bottomInset,
  onClose,
  onOpenRef,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [refs, setRefs] = useState<CrossRef[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!verse) return;
    let alive = true; // el usuario puede cerrar el modal antes de que llegue la respuesta

    setLoading(true);
    setFailed(false);
    fetchVerseXrefs(token, verse.book, verse.chapter, verse.verse, version).then((data) => {
      if (!alive) return;
      setRefs(data?.results ?? []);
      setFailed(data === null);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [verse?.book, verse?.chapter, verse?.verse, version, token]);

  if (!verse) return null;

  const label = (r: CrossRef) =>
    `${r.book} ${r.chapter}:${r.verse}${r.endVerse ? `-${r.endVerse}` : ''}`;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
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
            maxHeight: '85%',
          }}
        >
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: bottomInset + 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="git-network-outline" size={20} color={colors.accent} />
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>
                Referencias cruzadas
              </Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>
              Pasajes relacionados con {verse.book} {verse.chapter}:{verse.verse}
            </Text>

            {loading && (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator color={colors.accent} />
              </View>
            )}

            {!loading && failed && (
              <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 24, textAlign: 'center' }}>
                Las referencias cruzadas necesitan conexión a internet.
              </Text>
            )}

            {!loading && !failed && refs.length === 0 && (
              <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 24, textAlign: 'center' }}>
                Este versículo no tiene referencias cruzadas.
              </Text>
            )}

            {!loading &&
              refs.map((r) => (
                <TouchableOpacity
                  key={label(r)}
                  onPress={() => onOpenRef(r)}
                  style={{
                    marginTop: 12,
                    padding: 14,
                    borderRadius: 14,
                    backgroundColor: colors.bgTertiary,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>
                      {label(r)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 6 }}>
                    {r.text}
                  </Text>
                </TouchableOpacity>
              ))}

            {/* La licencia CC-BY del dataset obliga a atribuir la fuente. */}
            {!loading && refs.length > 0 && (
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 18, textAlign: 'center' }}>
                Referencias de openbible.info (CC BY)
              </Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
