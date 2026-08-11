import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { searchBackgroundPhotos } from '../../src/services/bibleService';
import { PhotoCard, photoCardChip } from '../../src/components/bible/PhotoCard';

// Mismo "chasis" visual que la portada de la Biblia (PhotoCard: foto + velo +
// texto blanco) — antes esto era una rejilla de cajitas con borde, muy pobre
// al lado del resto de la app. Cada tarjeta es una entrada de este arreglo:
// agregar una nueva es sumar un objeto, sin tocar el layout.
type MenuCard = {
  key: string;
  label: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  query: string; // búsqueda de foto de fondo (Pexels)
  fallback: string; // color si no hay foto (sin red o sin PEXELS_API_KEY)
};

const CARDS: MenuCard[] = [
  { key: 'ajustes', label: 'Tu cuenta', title: 'Ajustes', subtitle: 'Perfil, notificaciones, privacidad', icon: 'settings-outline', route: '/menu/ajustes', query: 'minimal desk workspace', fallback: '#334155' },
  { key: 'comunidad', label: 'Comunidad', title: 'Comunidad', subtitle: 'Publicaciones y conexiones', icon: 'people-outline', route: '/comunidad', query: 'friends community people', fallback: '#7c3aed' },
  { key: 'seminarios', label: 'Aprende', title: 'Seminarios', subtitle: 'Clases y constancias', icon: 'school-outline', route: '/seminarios', query: 'study graduation books', fallback: '#0f766e' },
  { key: 'materiales', label: 'Recursos', title: 'Materiales', subtitle: 'Estudios y libros', icon: 'library-outline', route: '/menu/materiales', query: 'library books reading', fallback: '#b45309' },
  { key: 'informacion', label: 'Ayuda', title: 'Información', subtitle: 'Reglamentos, FAQ, contacto', icon: 'information-circle-outline', route: '/menu/informacion', query: 'open book candle', fallback: '#1d4ed8' },
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
