import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchDailyVerse, type DailyVerse } from '../../services/bibleService';
import { useBibleStore } from '../../store/useBibleStore';

/**
 * Versículo del día en el feed de Comunidad, arriba del todo.
 *
 * Es una tarjeta AUTÓNOMA a propósito: la de la pestaña Biblia
 * (`bible/DailyVerseCard`) recibe por props los favoritos, la foto de fondo, el
 * recordatorio y cuatro manejadores, todo estado de esa pantalla. Traerlo aquí
 * habría significado duplicar ese estado en dos pestañas para acabar mostrando
 * el mismo versículo. Aquí solo se lee, y "Leer" lleva a la Biblia, que es donde
 * viven las acciones (favorito, compartir como imagen, recordatorio).
 *
 * Si la petición falla o la versión elegida no trae ese pasaje —las biblias
 * históricas son parciales—, la tarjeta no se pinta: es un extra del feed, no
 * puede dejar un hueco ni un error donde deberían estar las publicaciones.
 */
// Sin `colors`: esta tarjeta es oscura SIEMPRE, igual que la de la pestaña
// Biblia (un `PhotoCard` con fondo `#312e81` y texto blanco encima). No es un
// color de tema suelto, es el fondo de la tarjeta entera.
export function DailyVerseFeedCard() {
  const [daily, setDaily] = useState<DailyVerse | null>(null);
  // La versión elegida por la persona, no la de por defecto: si lee en RVR60,
  // el versículo del feed tiene que salir en RVR60.
  const selectedVersion = useBibleStore((s) => s.selectedVersion);

  useEffect(() => {
    let cancelado = false;
    fetchDailyVerse(selectedVersion)
      .then((v) => { if (!cancelado) setDaily(v); })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [selectedVersion]);

  if (!daily) return null;

  const abrirEnLaBiblia = () =>
    router.navigate({
      pathname: '/(tabs)/bible',
      params: { openRef: `${daily.book}|${daily.chapter}|${daily.verse}` },
    } as any);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={abrirEnLaBiblia}
      style={{
        marginHorizontal: 16, marginTop: 12, marginBottom: 4,
        borderRadius: 16, padding: 16,
        backgroundColor: '#312e81',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="sunny" size={14} color="rgba(255,255,255,0.85)" />
        <Text style={{
          color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700',
          letterSpacing: 1, textTransform: 'uppercase',
        }}>
          Versículo del día
        </Text>
      </View>

      <Text style={{ color: '#fff', fontSize: 16, lineHeight: 25, marginTop: 10 }}>
        “{daily.text}”
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
          {daily.book} {daily.chapter}:{daily.verse}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="book-outline" size={14} color="rgba(255,255,255,0.9)" />
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' }}>Leer</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
