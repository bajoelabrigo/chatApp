import React from 'react';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityType } from '../services/activityService';

/**
 * Icono vectorial por tipo de actividad (reemplaza los emojis para una
 * iconografía uniforme con la web — ver holy_app/.../ActivityIcon.jsx).
 *
 * react-icons no funciona en React Native, así que aquí se usan los
 * equivalentes de @expo/vector-icons (FontAwesome5 coincide con los iconos
 * Fa* de la web; cilicio usa MaterialCommunityIcons como equivalente cercano).
 */
type IconSpec =
  | { family: 'fa5'; name: string }
  | { family: 'mci'; name: string };

const ICONS: Record<string, IconSpec> = {
  ayuno: { family: 'fa5', name: 'pray' },
  vigilia: { family: 'fa5', name: 'church' },
  escala_oracion: { family: 'fa5', name: 'praying-hands' },
  cilicio: { family: 'mci', name: 'meditation' },
  bible_reading: { family: 'fa5', name: 'bible' },
  evangelism: { family: 'fa5', name: 'bullhorn' },
  // aliases deprecados
  prayer: { family: 'fa5', name: 'praying-hands' },
  fasting: { family: 'fa5', name: 'pray' },
};

export function ActivityIcon({
  type,
  size = 22,
  color,
}: {
  type?: ActivityType | string;
  size?: number;
  color?: string;
}) {
  const spec = ICONS[type ?? ''] ?? ICONS.escala_oracion;
  if (spec.family === 'mci') {
    return <MaterialCommunityIcons name={spec.name as any} size={size} color={color} />;
  }
  return <FontAwesome5 name={spec.name as any} size={size} color={color} />;
}
