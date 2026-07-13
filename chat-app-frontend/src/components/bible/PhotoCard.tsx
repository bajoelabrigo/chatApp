import { ReactNode } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

// El "chasis" visual de las tarjetas de la portada de la Biblia: foto de fondo,
// velo oscuro y texto blanco encima.
//
// Existe para que las tarjetas se vean IGUALES de verdad, no solo parecidas. El
// versículo del día estrenó este aspecto; al añadir "lee con tu grupo" y
// "continuar leyendo" con el mismo look, copiar el bloque tres veces habría
// garantizado que se separasen al primer retoque.
//
// La foto es opcional: sin clave de Pexels (o sin red) queda el color de fondo,
// que ya es digno por sí solo.

interface Props {
  /** Rótulo pequeño en mayúsculas ("VERSÍCULO DEL DÍA"). */
  label: string;
  photo: string | null;
  /** Color de fondo cuando no hay foto. */
  fallback: string;
  children: ReactNode;
}

export function PhotoCard({ label, photo, fallback, children }: Props) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: fallback,
      }}
    >
      {photo && (
        <Image
          source={{ uri: photo }}
          style={{ ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      )}
      {/* Velo oscuro: sin él, el texto blanco se pierde en las fotos claras. */}
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' }} />

      <View style={{ padding: 16 }}>
        <Text
          style={{
            color: 'rgba(255,255,255,0.75)',
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
        {children}
      </View>
    </View>
  );
}

/** El chip de acción de estas tarjetas (translúcido sobre la foto). */
export const photoCardChip = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 6,
  paddingVertical: 7,
  paddingHorizontal: 10,
  borderRadius: 16,
  backgroundColor: 'rgba(255,255,255,0.16)',
};
