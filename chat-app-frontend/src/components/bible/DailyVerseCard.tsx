import { View, Text, TouchableOpacity, Image, StyleSheet, Platform } from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { VERSION_META } from '../../constants/bible';
import type { VerseItem } from '../../constants/bible';
import type { DailyVerse } from '../../services/bibleService';

// Tarjeta del versículo del día (#8). Es el mismo versículo para toda la
// comunidad cada día: se puede guardar, compartir como imagen o abrir el
// capítulo entero. La foto de fondo es opcional (sin clave de Pexels queda el
// color).
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

interface Props {
  daily: DailyVerse | null;
  photo: string | null;
  isFavorite: boolean;
  // null = aún no sabemos si tiene el aviso diario (invitado) → no se pinta la campana.
  reminder: boolean | null;
  colors: any;
  onToggleFavorite: (item: VerseItem, id: string) => void;
  onShareImage: (item: VerseItem) => void;
  onRead: (item: VerseItem) => void;
  onToggleReminder: () => void;
}

export function DailyVerseCard({
  daily,
  photo,
  isFavorite,
  reminder,
  colors,
  onToggleFavorite,
  onShareImage,
  onRead,
  onToggleReminder,
}: Props) {
  if (!daily) return null;

  const id = `${daily.book}:${daily.chapter}:${daily.verse}`;
  const item: VerseItem = {
    book: daily.book,
    chapter: daily.chapter,
    verse: daily.verse,
    text: daily.text,
  };

  const chip = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
  };

  return (
    <View style={{
      marginHorizontal: 16, marginTop: 16, borderRadius: 18, overflow: 'hidden',
      backgroundColor: '#312e81', // índigo profundo: fondo si no hay foto
    }}>
      {photo && (
        <Image
          source={{ uri: photo }}
          style={{ ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      )}
      {/* Velo oscuro: sin él, el texto blanco se pierde en las fotos claras */}
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' }} />

      <View style={{ padding: 16 }}>
        <Text style={{
          color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700',
          letterSpacing: 1, textTransform: 'uppercase',
        }}>
          Versículo del día
        </Text>

        {/* Serif, como la tarjeta de la web y como la imagen que se comparte. */}
        <Text style={{ color: '#fff', fontSize: 16, lineHeight: 25, marginTop: 10, fontFamily: SERIF }}>
          “{daily.text}”
        </Text>

        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 10 }}>
          {daily.book} {daily.chapter}:{daily.verse}
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '400' }}>
            {'  '}{VERSION_META[daily.version]?.short ?? daily.version}
          </Text>
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
          <TouchableOpacity onPress={() => onToggleFavorite(item, id)} style={chip}>
            <FontAwesome5 name="star" solid={isFavorite} size={13} color={isFavorite ? '#FBBF24' : '#fff'} />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
              {isFavorite ? 'Guardado' : 'Guardar'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => onShareImage(item)} style={chip}>
            <Ionicons name="image-outline" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Compartir</Text>
          </TouchableOpacity>

          {/* Abrir el capítulo entero: reusa el salto a referencia (#7). */}
          <TouchableOpacity onPress={() => onRead(item)} style={chip}>
            <Ionicons name="book-outline" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Leer</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          {reminder !== null && (
            <TouchableOpacity onPress={onToggleReminder} style={{ padding: 6 }}>
              <Ionicons
                name={reminder ? 'notifications' : 'notifications-off-outline'}
                size={18}
                color="#fff"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
