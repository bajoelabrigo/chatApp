import { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../../../src/context/ThemeContext';
import { useAuthStore } from '../../../src/store/useAuthStore';
import { getMyCertificate, type CertificateData } from '../../../src/services/seminarService';

// Constancia sencilla dibujada en RN (sin la plantilla artística Canvas de la
// web) — se captura a tamaño completo fuera de pantalla con react-native-view-shot
// (mismo patrón que VerseImageSheet.tsx) para que la imagen compartida salga
// nítida sin depender del tamaño de la previa en pantalla.
const CERT_W = 1000;
const CERT_H = 640;

function CertificateCard({ data, style }: { data: CertificateData; style: any }) {
  const { colors } = useTheme();
  const date = new Date(data.issuedAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <View style={[{ width: CERT_W, height: CERT_H, backgroundColor: '#fff', padding: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 10, borderColor: colors.accent }, style]}>
      <Ionicons name="ribbon" size={56} color={colors.accent} />
      <Text style={{ fontSize: 16, letterSpacing: 4, color: '#888', marginTop: 16, textTransform: 'uppercase' }}>Constancia de finalización</Text>
      <Text style={{ fontSize: 40, fontWeight: '800', color: '#111', textAlign: 'center', marginTop: 20 }}>{data.studentName}</Text>
      <Text style={{ fontSize: 18, color: '#444', textAlign: 'center', marginTop: 16 }}>ha completado satisfactoriamente el seminario</Text>
      <Text style={{ fontSize: 26, fontWeight: '700', color: colors.accent, textAlign: 'center', marginTop: 8 }}>{data.seminarTitle}</Text>
      <Text style={{ fontSize: 14, color: '#888', marginTop: 28 }}>{data.totalClasses} clases completadas · {date}</Text>
      <Text style={{ fontSize: 13, color: '#aaa', marginTop: 6, letterSpacing: 1 }}>Código {data.code}</Text>
    </View>
  );
}

export default function CertificateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { token } = useAuthStore();
  const { width } = useWindowDimensions();

  const [data, setData] = useState<CertificateData | null>(null);
  const [ineligible, setIneligible] = useState<{ completed: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const posterRef = useRef<View>(null);
  const previewRef = useRef<View>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const cert = await getMyCertificate(token, id);
      setData(cert);
      setIneligible(null);
    } catch (err: any) {
      const body = err?.response?.data;
      if (err?.response?.status === 403 && body) {
        setIneligible({ completed: body.completed ?? 0, total: body.total ?? 0 });
      } else {
        Alert.alert('Error', 'No se pudo obtener la constancia');
        router.back();
      }
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      let uri: string;
      try {
        uri = await captureRef(posterRef, { format: 'png', quality: 1 });
      } catch {
        uri = await captureRef(previewRef, { format: 'png', quality: 1 });
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Constancia — ${data?.seminarTitle}` });
      }
    } catch {
      Alert.alert('Error', 'No se pudo generar la imagen');
    } finally {
      setSharing(false);
    }
  };

  const previewScale = (width - 32) / CERT_W;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        backgroundColor: colors.headerBg,
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', flex: 1 }}>Constancia</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : ineligible ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="ribbon-outline" size={48} color={colors.textMuted} />
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, marginTop: 16, textAlign: 'center' }}>
            Aún no has completado todas las clases
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 6, textAlign: 'center' }}>
            {ineligible.completed} de {ineligible.total} clases completadas
          </Text>
        </View>
      ) : data ? (
        <View style={{ flex: 1, alignItems: 'center', paddingTop: 32 }}>
          {/* Contenedor con el tamaño YA escalado (el hijo no afecta el layout
              del padre al tener `transform` — mismo patrón que VerseImageSheet.tsx). */}
          <View style={{ width: CERT_W * previewScale, height: CERT_H * previewScale }}>
            <View
              ref={previewRef}
              collapsable={false}
              style={{ width: CERT_W, height: CERT_H, transform: [{ scale: previewScale }], transformOrigin: 'top left' }}
            >
              <CertificateCard data={data} style={{}} />
            </View>
          </View>

          <TouchableOpacity
            onPress={handleShare}
            disabled={sharing}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: colors.accent, borderRadius: 14,
              paddingVertical: 14, paddingHorizontal: 28,
              marginTop: 32, opacity: sharing ? 0.7 : 1,
            }}
          >
            {sharing ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="share-outline" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Compartir / Descargar</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Copia a tamaño completo, fuera de pantalla — es la que de verdad se captura. */}
          <View ref={posterRef} collapsable={false} style={{ position: 'absolute', left: -10000, top: 0 }}>
            <CertificateCard data={data} style={{}} />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
