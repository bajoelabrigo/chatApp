import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { VERSION_META } from '../../constants/bible';
import type { VerseItem } from '../../constants/bible';
import type { DailyVerse } from '../../services/bibleService';
import { PhotoCard, photoCardChip } from './PhotoCard';

// Tarjeta del versículo del día (#8). Es el mismo versículo para toda la
// comunidad cada día: se puede guardar, compartir como imagen o abrir el
// capítulo entero.
//
// El chasis (foto + velo + rótulo) vive en `PhotoCard`, compartido con las
// tarjetas de grupo y de continuar leyendo: así las tres se ven iguales de
// verdad y un retoque las alcanza a todas.
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

  return (
    <PhotoCard label="Versículo del día" photo={photo} fallback="#312e81">
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
        <TouchableOpacity onPress={() => onToggleFavorite(item, id)} style={photoCardChip}>
          <FontAwesome5 name="star" solid={isFavorite} size={13} color={isFavorite ? '#FBBF24' : '#fff'} />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
            {isFavorite ? 'Guardado' : 'Guardar'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onShareImage(item)} style={photoCardChip}>
          <Ionicons name="image-outline" size={14} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Compartir</Text>
        </TouchableOpacity>

        {/* Abrir el capítulo entero: reusa el salto a referencia (#7). */}
        <TouchableOpacity onPress={() => onRead(item)} style={photoCardChip}>
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
    </PhotoCard>
  );
}
