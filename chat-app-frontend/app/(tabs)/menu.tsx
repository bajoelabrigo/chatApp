import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { searchBackgroundPhotos } from '../../src/services/bibleService';
import { PhotoCard, photoCardChip } from '../../src/components/bible/PhotoCard';

// Menú principal de la app: una tarjeta por sección. El orden de este arreglo
// es el orden en pantalla. Agregar una sección es sumar un objeto.
type MenuCard = {
  key: string;
  label: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  query: string; // búsqueda de foto de fondo (Pexels)
  fallback: string; // color si no hay foto
};

const CARDS: MenuCard[] = [
  { key: 'comunidad', label: 'Comunidad', title: 'Comunidad', subtitle: 'Publicaciones y conexiones', icon: 'people-outline', route: '/comunidad', query: 'friends community people', fallback: '#7c3aed' },
  { key: 'chat', label: 'Chat', title: 'Chat', subtitle: 'Tus conversaciones', icon: 'chatbubble-ellipses-outline', route: '/(tabs)/chats', query: 'chat messaging phone', fallback: '#0ea5e9' },
  { key: 'biblia', label: 'Biblia', title: 'Biblia', subtitle: 'Leer la Palabra', icon: 'book-outline', route: '/(tabs)/bible', query: 'open bible pages', fallback: '#1d4ed8' },
  { key: 'materiales', label: 'Recursos', title: 'Materiales', subtitle: 'Estudios y libros', icon: 'library-outline', route: '/menu/materiales', query: 'library books reading', fallback: '#b45309' },
  { key: 'seminario', label: 'Aprende', title: 'Seminario', subtitle: 'Clases y constancias', icon: 'school-outline', route: '/seminarios', query: 'study graduation books', fallback: '#0f766e' },
  { key: 'actividades', label: 'Actividades', title: 'Actividades', subtitle: 'Ayunos, vigilias y oración', icon: 'flame-outline', route: '/(tabs)/actividades', query: 'prayer candle faith', fallback: '#ea580c' },
  { key: 'ofrendas', label: 'Ofrendas', title: 'Ofrendas', subtitle: 'Dar una ofrenda', icon: 'heart-outline', route: '/(tabs)/ofrendas', query: 'heart giving love', fallback: '#dc2626' },
  { key: 'donaciones', label: 'Donaciones', title: 'Donaciones', subtitle: 'Apoyar el ministerio', icon: 'gift-outline', route: '/(tabs)/ofrendas', query: 'gift donation support', fallback: '#16a34a' },
  { key: 'ajustes', label: 'Tu cuenta', title: 'Ajustes', subtitle: 'Perfil, notificaciones, privacidad', icon: 'settings-outline', route: '/menu/ajustes', query: 'minimal desk workspace', fallback: '#334155' },
];

export default function MenuScreen() {
  const { colors } = useTheme();
  const [photos, setPhotos] = useState<Record<string, string | null>>({});

  useEffect(() => {
    CARDS.forEach((card) => {
      searchBackgroundPhotos(card.query, 1)
        .then((results) => {
          if (results.length) setPhotos((p) => ({ ...p, [card.key]: results[0].full }));
        })
        .catch(() => {});
    });
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {CARDS.map((card) => (
          <TouchableOpacity key={card.key} activeOpacity={0.9} onPress={() => router.push(card.route as any)}>
            <PhotoCard label={card.label} photo={photos[card.key] ?? null} fallback={card.fallback}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{card.title}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, marginTop: 3 }}>{card.subtitle}</Text>
                </View>
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: 'rgba(255,255,255,0.18)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name={card.icon} size={20} color="#fff" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
                <View style={photoCardChip}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Abrir</Text>
                  <Ionicons name="arrow-forward" size={13} color="#fff" />
                </View>
              </View>
            </PhotoCard>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
