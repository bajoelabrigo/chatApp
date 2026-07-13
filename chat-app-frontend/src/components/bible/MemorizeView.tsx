import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MemorizeVerse } from '../../services/bibleService';

// Memorizar versículos.
//
// La tarjeta esconde palabras y el usuario intenta recitar el versículo; al
// revelarlo dice si le salió. Eso alimenta el repaso espaciado del backend: cada
// acierto aleja el siguiente repaso (1, 3, 7, 16, 35 días) y un fallo lo devuelve
// al principio.
//
// Cuántas palabras se ocultan depende del NIVEL: al principio se esconden pocas
// (es una ayuda para leerlo y fijarlo) y al final, casi todas (ya es una prueba
// de memoria de verdad). Que la dificultad suba sola es lo que hace que el
// método funcione.
const HIDE_RATIO = [0.2, 0.35, 0.5, 0.7, 0.85, 1];

/**
 * Oculta palabras de forma DETERMINISTA (no al azar): con `Math.random` cada
 * repintado cambiaría las palabras escondidas y el ejercicio sería un caos. El
 * hash del índice + el nivel decide qué palabra cae, así que la misma tarjeta se
 * ve igual mientras no cambie de nivel.
 */
function hiddenIndexes(words: string[], level: number): Set<number> {
  const ratio = HIDE_RATIO[Math.min(level, HIDE_RATIO.length - 1)];
  const target = Math.round(words.length * ratio);
  const scored = words.map((w, i) => ({ i, score: ((i * 2654435761 + level * 40503) >>> 0) % 1000 }));
  scored.sort((a, b) => a.score - b.score);
  return new Set(scored.slice(0, target).map((s) => s.i));
}

interface Props {
  loading: boolean;
  verses: MemorizeVerse[];
  colors: any;
  bottomInset: number;
  onReview: (v: MemorizeVerse, correct: boolean) => void;
  onRemove: (v: MemorizeVerse) => void;
}

export function MemorizeView({ loading, verses, colors, bottomInset, onReview, onRemove }: Props) {
  // Índice de la tarjeta en curso dentro de las que tocan hoy, y si está revelada.
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const due = useMemo(() => verses.filter((v) => v.isDue), [verses]);
  const learned = useMemo(() => verses.filter((v) => v.isLearned), [verses]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (verses.length === 0) {
    return (
      <ScrollView contentContainerStyle={{ padding: 32, alignItems: 'center', paddingTop: 60 }}>
        <Ionicons name="school-outline" size={48} color={colors.textMuted} />
        <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 17, marginTop: 16, textAlign: 'center' }}>
          Aún no memorizas ningún versículo
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
          Mantén pulsado un versículo mientras lees y elige "Memorizar". Te lo iremos
          repasando en el momento justo para que no se te olvide.
        </Text>
      </ScrollView>
    );
  }

  // Nada pendiente hoy: se felicita en vez de dejar la pantalla vacía.
  if (due.length === 0) {
    return (
      <ScrollView contentContainerStyle={{ padding: 32, alignItems: 'center', paddingTop: 60 }}>
        <Text style={{ fontSize: 44 }}>🎉</Text>
        <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 17, marginTop: 12, textAlign: 'center' }}>
          No te toca repasar nada hoy
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center' }}>
          Memorizas {verses.length} versículo{verses.length === 1 ? '' : 's'}
          {learned.length > 0 ? ` · ${learned.length} aprendido${learned.length === 1 ? '' : 's'}` : ''}.
          Vuelve mañana.
        </Text>
      </ScrollView>
    );
  }

  const current = due[Math.min(index, due.length - 1)];
  const words = current.text.split(/\s+/).filter(Boolean);
  const hidden = hiddenIndexes(words, current.level);

  const answer = (correct: boolean) => {
    onReview(current, correct);
    setRevealed(false);
    // Se avanza a la siguiente pendiente. Al llegar al final, la lista se recarga
    // sola en la pantalla (la respuesta ya no está "due").
    setIndex((i) => (i + 1 >= due.length ? 0 : i + 1));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
        {due.length} por repasar hoy · {verses.length} en total
      </Text>

      <View
        style={{
          borderRadius: 20,
          padding: 20,
          backgroundColor: colors.bgSecondary,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 15 }}>
          {current.book} {current.chapter}:{current.verse}
        </Text>

        {/* Nivel: cuántos escalones lleva superados de los 5 del repaso. */}
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={{
                width: 22,
                height: 4,
                borderRadius: 2,
                backgroundColor: i < current.level ? colors.accent : colors.bgTertiary,
              }}
            />
          ))}
        </View>

        {/* El versículo, con palabras ocultas hasta que se revela. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 18 }}>
          {words.map((w, i) => {
            const isHidden = !revealed && hidden.has(i);
            return (
              <View key={i} style={{ marginRight: 6, marginBottom: 8 }}>
                {isHidden ? (
                  <View
                    style={{
                      backgroundColor: colors.bgTertiary,
                      borderRadius: 5,
                      borderWidth: 1,
                      borderColor: colors.border,
                      // El hueco conserva el ANCHO de la palabra: la longitud es
                      // una pista legítima y evita que el texto salte al revelar.
                      width: Math.max(18, w.length * 9),
                      height: 21,
                    }}
                  />
                ) : (
                  <Text style={{ color: colors.textPrimary, fontSize: 16, lineHeight: 21 }}>{w}</Text>
                )}
              </View>
            );
          })}
        </View>

        {!revealed ? (
          <TouchableOpacity
            onPress={() => setRevealed(true)}
            style={{
              marginTop: 14,
              paddingVertical: 13,
              borderRadius: 22,
              alignItems: 'center',
              backgroundColor: colors.accent,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Revelar</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ marginTop: 14 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 10 }}>
              ¿Te salió?
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => answer(false)}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: 22,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Todavía no</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => answer(true)}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: 22,
                  alignItems: 'center',
                  backgroundColor: '#22c55e',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>¡Me lo sé!</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={() => onRemove(current)}
        style={{ marginTop: 16, alignItems: 'center' }}
      >
        <Text style={{ color: colors.danger, fontSize: 13 }}>Dejar de memorizar este versículo</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
