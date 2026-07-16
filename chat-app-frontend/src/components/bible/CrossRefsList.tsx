import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchVerseXrefs } from '../../services/bibleService';
import type { CrossRef } from '../../services/bibleService';
import type { VerseItem } from '../../constants/bible';

// Las referencias cruzadas de un versículo: la lista y nada más (sin hoja ni
// cabecera). La pintan `CrossRefsModal` (hoja inferior, uso normal) y el panel
// de la lectura en vivo, así que la carga y los estados vacíos viven aquí una
// sola vez.
//
// El dataset (openbible.info, CC-BY, derivado del Treasury of Scripture
// Knowledge) son solo punteros; el TEXTO sale de la versión activa, que resuelve
// el backend. Por eso basta UNA petición para pintar la lista entera.
//
// Vive en el servidor: sin conexión no hay referencias (el servicio devuelve
// null y se muestra el aviso, no un error).
//
// Espejo en la web: holy_app/frontend/src/components/bible/CrossRefsList.jsx.

interface Props {
  verse: VerseItem | null;
  token: string;
  version: string;
  colors: any;
  /** Navegar al pasaje tocado. Sin él, la lista es solo de lectura. */
  onOpenRef?: (ref: CrossRef) => void;
}

export function CrossRefsList({ verse, token, version, colors, onOpenRef }: Props) {
  const [loading, setLoading] = useState(true);
  const [refs, setRefs] = useState<CrossRef[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!verse) return;
    let alive = true; // se puede cerrar antes de que llegue la respuesta

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

  if (loading) {
    return (
      <View style={{ paddingVertical: 40, alignItems: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (failed) {
    return (
      <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 24, textAlign: 'center' }}>
        Las referencias cruzadas necesitan conexión a internet.
      </Text>
    );
  }

  if (refs.length === 0) {
    return (
      <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 24, textAlign: 'center' }}>
        Este versículo no tiene referencias cruzadas.
      </Text>
    );
  }

  return (
    <>
      {refs.map((r) => (
        <TouchableOpacity
          key={label(r)}
          onPress={() => onOpenRef?.(r)}
          disabled={!onOpenRef}
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
            <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>{label(r)}</Text>
            {!!onOpenRef && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 6 }}>
            {r.text}
          </Text>
        </TouchableOpacity>
      ))}

      {/* La licencia CC-BY del dataset obliga a atribuir la fuente. */}
      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 18, textAlign: 'center' }}>
        Referencias de openbible.info (CC BY)
      </Text>
    </>
  );
}
