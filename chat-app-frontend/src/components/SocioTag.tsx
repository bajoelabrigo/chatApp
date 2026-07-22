import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

// Insignia de "Socio" junto al nombre: escudo con check + (opcional) el texto
// "Socio". Se pinta en la burbuja del chat, la lista de miembros del grupo y el
// perfil de contacto. El dato viene en `ChatUser.isSocio`.
export function SocioTag({
  showText = true,
  size = 12,
}: {
  showText?: boolean;
  size?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name="shield-checkmark" size={size} color={colors.accent} />
      {showText && (
        <Text
          style={{
            color: colors.accent,
            fontSize: size - 2,
            fontWeight: '700',
            marginLeft: 2,
          }}
        >
          Socio
        </Text>
      )}
    </View>
  );
}
