import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Image,
  ActivityIndicator, Alert, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../src/context/ThemeContext';
import { useAuthStore } from '../../../src/store/useAuthStore';
import { uploadFile } from '../../../src/services/uploadService';
import {
  getSeminarClasses, getMyTaskForClass, markClassCompleted, getMyProgress,
  uploadTask, deleteMyTask, updateStudentComment,
  type SeminarClass, type SeminarTask,
} from '../../../src/services/seminarService';
import { classMaterials } from '../../../src/lib/seminarFiles';
import { youtubeThumbnail } from '../../../src/lib/youtube';

const STATUS_LABEL: Record<string, string> = {
  enviado: 'Enviada — a la espera de revisión',
  pendiente: 'Pendiente de revisión',
  completo: 'Aprobada',
  incompleto: 'Necesita corrección',
};

export default function SeminarClassScreen() {
  const { classId, seminarId } = useLocalSearchParams<{ classId: string; seminarId: string }>();
  const { colors } = useTheme();
  const { token } = useAuthStore();

  const [cls, setCls] = useState<SeminarClass | null>(null);
  const [task, setTask] = useState<SeminarTask | null>(null);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const [message, setMessage] = useState('');
  const [pickedFile, setPickedFile] = useState<{ uri: string; name: string; mimeType: string; size?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [studentComment, setStudentComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  const load = useCallback(async () => {
    if (!token || !seminarId || !classId) return;
    try {
      const [classes, myTask, progress] = await Promise.all([
        getSeminarClasses(token, seminarId),
        getMyTaskForClass(token, seminarId, classId),
        getMyProgress(token, seminarId),
      ]);
      const found = classes.find((c) => c._id === classId) ?? null;
      setCls(found);
      setTask(myTask);
      setMessage(myTask?.message ?? '');
      setStudentComment(myTask?.studentComment ?? '');
      setCompleted((progress.completedClasses ?? []).includes(classId));
    } catch {
      Alert.alert('Error', 'No se pudo cargar la clase');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [token, seminarId, classId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleOpenVideo = () => {
    if (cls?.youtubeUrl) WebBrowser.openBrowserAsync(cls.youtubeUrl);
  };

  const handleMarkCompleted = async () => {
    if (!token || !seminarId || !classId) return;
    setMarking(true);
    try {
      await markClassCompleted(token, seminarId, classId);
      setCompleted(true);
    } catch {
      Alert.alert('Error', 'No se pudo marcar la clase');
    } finally {
      setMarking(false);
    }
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPickedFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream', size: asset.size ?? undefined });
  };

  const handleSubmitTask = async () => {
    if (!token || !seminarId || !classId) return;
    if (!pickedFile && !task?.fileUrl && !message.trim()) {
      Alert.alert('Falta contenido', 'Adjunta un archivo o escribe un mensaje.');
      return;
    }
    setSubmitting(true);
    try {
      let fileUrl: string | undefined;
      let fileName: string | undefined;
      let fileFormat: string | undefined;
      let fileSizeBytes: number | undefined;

      if (pickedFile) {
        const uploaded = await uploadFile(token, pickedFile.uri, pickedFile.mimeType, pickedFile.name);
        fileUrl = uploaded.url;
        fileName = uploaded.originalName;
        fileFormat = uploaded.mimeType;
        fileSizeBytes = uploaded.size;
      }

      await uploadTask(token, seminarId, classId, { fileUrl, fileName, fileFormat, fileSizeBytes, message: message.trim() || undefined });
      setPickedFile(null);
      await load();
      Alert.alert('Listo', 'Tu tarea fue enviada.');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'No se pudo enviar la tarea');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTask = () => {
    Alert.alert('Eliminar tarea', '¿Eliminar tu entrega de esta clase?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          if (!token || !seminarId || !classId) return;
          try {
            await deleteMyTask(token, seminarId, classId);
            setTask(null);
            setMessage('');
            setStudentComment('');
          } catch {
            Alert.alert('Error', 'No se pudo eliminar la tarea');
          }
        },
      },
    ]);
  };

  const handleSaveComment = async () => {
    if (!token || !seminarId || !classId) return;
    setSavingComment(true);
    try {
      await updateStudentComment(token, seminarId, classId, studentComment.trim());
      Alert.alert('Guardado', 'Tu comentario se actualizó.');
    } catch {
      Alert.alert('Error', 'No se pudo guardar el comentario');
    } finally {
      setSavingComment(false);
    }
  };

  if (loading || !cls) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const materials = classMaterials(cls);
  const cardStyle = {
    marginHorizontal: 16, marginTop: 16, borderRadius: 16,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
    padding: 16,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border,
          backgroundColor: colors.headerBg,
        }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '600', flex: 1 }} numberOfLines={1}>{cls.title}</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Video */}
          {!!cls.youtubeUrl && (
            <TouchableOpacity
              onPress={handleOpenVideo}
              activeOpacity={0.85}
              style={{ margin: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}
            >
              {youtubeThumbnail(cls.youtubeUrl) ?? cls.image ? (
                <Image source={{ uri: (youtubeThumbnail(cls.youtubeUrl) ?? cls.image) as string }} style={{ width: '100%', height: 190 }} resizeMode="cover" />
              ) : (
                <View style={{ width: '100%', height: 190, backgroundColor: colors.bgTertiary }} />
              )}
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="play" size={28} color="#111" style={{ marginLeft: 3 }} />
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* Completar */}
          <View style={{ marginHorizontal: 16 }}>
            <TouchableOpacity
              onPress={handleMarkCompleted}
              disabled={completed || marking}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                borderRadius: 14, paddingVertical: 13,
                backgroundColor: completed ? colors.accent + '18' : colors.accent,
                borderWidth: completed ? 1 : 0, borderColor: colors.accent,
              }}
            >
              {marking ? (
                <ActivityIndicator color={completed ? colors.accent : '#fff'} size="small" />
              ) : (
                <>
                  <Ionicons name={completed ? 'checkmark-circle' : 'checkmark-circle-outline'} size={18} color={completed ? colors.accent : '#fff'} />
                  <Text style={{ color: completed ? colors.accent : '#fff', fontWeight: '700' }}>
                    {completed ? 'Clase completada' : 'Marcar como completada'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Materiales */}
          {(materials.length > 0 || cls.assignment?.url) && (
            <View style={cardStyle}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Materiales
              </Text>
              {materials.map((m, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => m.url && Linking.openURL(m.url)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}
                >
                  <Ionicons name="document-text-outline" size={20} color={colors.accent} />
                  <Text style={{ color: colors.textPrimary, flex: 1 }} numberOfLines={1}>{m.name ?? 'Material'}</Text>
                  <Ionicons name="download-outline" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
              {!!cls.assignment?.url && (
                <TouchableOpacity
                  onPress={() => cls.assignment?.url && Linking.openURL(cls.assignment.url)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: materials.length ? 1 : 0, borderTopColor: colors.border, marginTop: materials.length ? 6 : 0 }}
                >
                  <Ionicons name="clipboard-outline" size={20} color={colors.accent} />
                  <Text style={{ color: colors.textPrimary, flex: 1 }} numberOfLines={1}>{cls.assignment.name ?? 'Instrucciones de la tarea'}</Text>
                  <Ionicons name="download-outline" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Mi tarea */}
          <View style={cardStyle}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Mi tarea
            </Text>

            {task?.status && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Ionicons
                  name={task.status === 'completo' ? 'checkmark-circle' : task.status === 'incompleto' ? 'alert-circle' : 'time-outline'}
                  size={16}
                  color={task.status === 'completo' ? colors.accent : task.status === 'incompleto' ? colors.danger : colors.textMuted}
                />
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{STATUS_LABEL[task.status] ?? task.status}</Text>
              </View>
            )}

            {!!task?.feedback && (
              <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>COMENTARIO DEL PROFESOR</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 13 }}>{task.feedback}</Text>
              </View>
            )}

            {(task?.fileUrl || pickedFile) && (
              <TouchableOpacity
                onPress={() => task?.fileUrl && Linking.openURL(task.fileUrl)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bgTertiary, borderRadius: 10, padding: 10, marginBottom: 12 }}
              >
                <Ionicons name="document-attach-outline" size={20} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 13 }} numberOfLines={1}>{pickedFile?.name ?? task?.fileName}</Text>
                  {!!task?.fileSize && !pickedFile && <Text style={{ color: colors.textMuted, fontSize: 11 }}>{task.fileSize}</Text>}
                  {!!pickedFile && <Text style={{ color: colors.accent, fontSize: 11 }}>Nuevo archivo — pendiente de enviar</Text>}
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={pickFile} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="attach-outline" size={18} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 13 }}>
                {task?.fileUrl || pickedFile ? 'Reemplazar archivo' : 'Adjuntar archivo'}
              </Text>
            </TouchableOpacity>

            <View style={{ borderRadius: 12, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Mensaje para el profesor (opcional)"
                placeholderTextColor={colors.inputPlaceholder}
                style={{ color: colors.inputText, fontSize: 14, minHeight: 50, textAlignVertical: 'top' }}
                multiline
              />
            </View>

            <TouchableOpacity
              onPress={handleSubmitTask}
              disabled={submitting}
              style={{ backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                <Text style={{ color: '#fff', fontWeight: '700' }}>{task ? 'Actualizar entrega' : 'Enviar tarea'}</Text>
              )}
            </TouchableOpacity>

            {!!task && (
              <TouchableOpacity onPress={handleDeleteTask} style={{ alignItems: 'center', marginTop: 12 }}>
                <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 13 }}>Eliminar mi entrega</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Mi comentario (independiente del archivo) */}
          <View style={cardStyle}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Mi comentario
            </Text>
            <View style={{ borderRadius: 12, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}>
              <TextInput
                value={studentComment}
                onChangeText={setStudentComment}
                placeholder="Escribe una nota sobre esta clase…"
                placeholderTextColor={colors.inputPlaceholder}
                style={{ color: colors.inputText, fontSize: 14, minHeight: 50, textAlignVertical: 'top' }}
                multiline
              />
            </View>
            <TouchableOpacity
              onPress={handleSaveComment}
              disabled={savingComment}
              style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.accent }}
            >
              {savingComment ? <ActivityIndicator color={colors.accent} size="small" /> : (
                <Text style={{ color: colors.accent, fontWeight: '700' }}>Guardar comentario</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
