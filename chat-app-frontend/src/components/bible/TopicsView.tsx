import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchTopics, fetchTopicDetail } from '../../services/bibleService';
import type { Topic, TopicDetail } from '../../services/bibleService';
import type { VerseItem } from '../../constants/bible';

// Pestaña "Temas": pasajes para un momento concreto (una boda, un cumpleaños,
// una visita, un duelo, un ataque de ansiedad…).
//
// Nace de lo que la gente pide de verdad: "¿qué leo en un bautizo?". La búsqueda
// por palabra no sirve para eso — quien busca "boda" no encuentra Eclesiastés
// 4:12, porque la palabra no aparece en el texto.
//
// Cada versículo es una fila propia (aunque el pasaje sea un rango): tocarla abre
// el pasaje y MANTENERLA PULSADA saca la barra de acciones completa, igual que en
// los resultados de búsqueda. Así un versículo de un tema tiene exactamente lo
// mismo que cualquier otro: favorito, resaltado, nota, etiquetas, compartir,
// referencias cruzadas, memorizar y pedir oración.
//
// El catálogo lo manda el backend (`lib/bibleTopics.ts`), no vive aquí.

interface Props {
  version: string;
  colors: any;
  bottomInset: number;
  /** Ir al pasaje (abre el capítulo y resalta el versículo). */
  onOpenVerse: (v: VerseItem) => void;
  /** Barra de acciones para ese versículo (mismo gesto que en la búsqueda). */
  onLongPressVerse: (v: VerseItem) => void;
}

export function TopicsView({
  version,
  colors,
  bottomInset,
  onOpenVerse,
  onLongPressVerse,
}: Props) {
  const [categories, setCategories] = useState<string[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTopics().then((c) => {
      setCategories(c.categories);
      setTopics(c.topics);
    });
  }, []);

  // Al cambiar de versión se recarga el tema abierto: sus textos son de la
  // versión anterior.
  useEffect(() => {
    if (!openKey) return;
    let alive = true;
    setLoading(true);
    fetchTopicDetail(openKey, version).then((d) => {
      if (!alive) return;
      setDetail(d);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [openKey, version]);

  // ── Un tema abierto: sus pasajes ─────────────────────────
  if (openKey) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}>
        <TouchableOpacity
          onPress={() => {
            setOpenKey(null);
            setDetail(null);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}
        >
          <Ionicons name="arrow-back" size={18} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 14 }}>
            Todos los temas
          </Text>
        </TouchableOpacity>

        {loading && (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}

        {!loading && detail && (
          <>
            <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700' }}>
              {detail.emoji} {detail.title}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 19 }}>
              {detail.description}
            </Text>

            {detail.passages.map((p) => (
              <View
                key={p.label}
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: colors.bgSecondary,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                {/* La referencia, bien visible: es lo que el usuario copia o
                    anuncia en voz alta ("leamos Eclesiastés 4:9-12"). */}
                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>
                  {p.label}
                </Text>

                {p.verses.map((v) => {
                  const item: VerseItem = {
                    book: p.book,
                    chapter: p.chapter,
                    verse: v.verse,
                    text: v.text,
                  };
                  return (
                    <TouchableOpacity
                      key={v.verse}
                      onPress={() => onOpenVerse(item)}
                      onLongPress={() => onLongPressVerse(item)}
                      style={{ paddingVertical: 5 }}
                    >
                      <Text style={{ color: colors.textPrimary, fontSize: 15, lineHeight: 23 }}>
                        <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>
                          {v.verse}{'  '}
                        </Text>
                        {v.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 18, textAlign: 'center' }}>
              Mantén pulsado un versículo para guardarlo, resaltarlo o compartirlo.
            </Text>
          </>
        )}

        {!loading && !detail && (
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 40, textAlign: 'center' }}>
            No se pudo cargar el tema. Revisa tu conexión.
          </Text>
        )}
      </ScrollView>
    );
  }

  // ── La lista de temas ────────────────────────────────────
  const q = query.trim().toLowerCase();
  const visible = topics.filter(
    (t) =>
      !q ||
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.inputBg,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 12,
        }}
      >
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar un tema (boda, ansiedad, duelo…)"
          placeholderTextColor={colors.inputPlaceholder}
          style={{ flex: 1, color: colors.inputText, paddingVertical: 10, fontSize: 15 }}
        />
      </View>

      {topics.length === 0 && (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {topics.length > 0 && visible.length === 0 && (
        <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 32, textAlign: 'center' }}>
          No hay ningún tema con ese nombre.
        </Text>
      )}

      {categories.map((cat) => {
        const list = visible.filter((t) => t.category === cat);
        if (!list.length) return null;
        return (
          <View key={cat} style={{ marginTop: 22 }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              {cat}
            </Text>

            {list.map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setOpenKey(t.key)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  marginBottom: 8,
                  borderRadius: 14,
                  backgroundColor: colors.bgSecondary,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 24 }}>{t.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>
                    {t.title}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {t.description}
                  </Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t.count}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}
