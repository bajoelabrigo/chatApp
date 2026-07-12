import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VERSION_META } from '../../constants/bible';

// Banner de descarga de la versión activa (para leer sin conexión).
// Tres estados: descargada, descargando (con progreso) y sin descargar.
interface Props {
  version: string;
  isDownloaded: boolean;
  isDownloading: boolean;
  progress: number; // 0..1
  colors: any;
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

export function DownloadBanner({
  version,
  isDownloaded,
  isDownloading,
  progress,
  colors,
  onDownload,
  onCancel,
  onDelete,
}: Props) {
  const vName = VERSION_META[version]?.name ?? version;

  return (
    <View style={{
      margin: 16, borderRadius: 16,
      backgroundColor: colors.bgSecondary,
      borderWidth: 1, borderColor: colors.border,
      overflow: 'hidden',
    }}>
      {isDownloaded ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#22c55e22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>{vName} descargada</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Disponible sin conexión</Text>
          </View>
          <TouchableOpacity
            onPress={onDelete}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      ) : isDownloading ? (
        <View style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 }}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 14, flex: 1 }}>
              Descargando {vName}... {Math.round(progress * 100)}%
            </Text>
            <TouchableOpacity onPress={onCancel}>
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={{ height: 6, backgroundColor: colors.bgTertiary, borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${Math.round(progress * 100)}%`, backgroundColor: colors.accent, borderRadius: 3 }} />
          </View>
        </View>
      ) : (
        <TouchableOpacity
          onPress={onDownload}
          style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}
          activeOpacity={0.7}
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="download-outline" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>Descargar para uso sin conexión</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>~5 MB · Funciona sin internet</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}
