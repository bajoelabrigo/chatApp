import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStore } from '../../src/store/useAuthStore';
import { usePostsStore } from '../../src/store/usePostsStore';
import { cld } from '../../src/lib/cldImage';
import { uploadFile } from '../../src/services/uploadService';
import { createPost } from '../../src/services/postService';
import { emojiPickerTheme } from '../../src/components/comunidad/reactions';
import BibleModal from '../../src/components/chat/BibleModal';
import type { SharedBible } from '../../src/services/conversationService';

export default function CreatePostScreen() {
  const { colors } = useTheme();
  const { token, user } = useAuthStore();
  const { setFeed, discoverFeed, friendsFeed } = usePostsStore();

  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [posting, setPosting] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [bibleOpen, setBibleOpen] = useState(false);
  const [bibleAttachment, setBibleAttachment] = useState<SharedBible | null>(null);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso denegado', 'Activa el acceso a la galería en Ajustes.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setImageUri(asset.uri);
    if (!token) return;
    setUploadingImage(true);
    try {
      const mime = asset.mimeType ?? 'image/jpeg';
      const fileName = asset.uri.split('/').pop() ?? 'photo.jpg';
      const uploaded = await uploadFile(token, asset.uri, mime, fileName);
      setImageUrl(uploaded.url);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'No se pudo subir la imagen');
      setImageUri(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = () => {
    setImageUri(null);
    setImageUrl(null);
  };

  const handleEmojiSelected = (e: EmojiType) => setText((prev) => prev + e.emoji);

  const handleBibleSelected = (passage: SharedBible) => {
    setBibleOpen(false);
    // Un post lleva un solo adjunto especial a la vez — el versículo reemplaza
    // cualquier foto ya elegida, para no mezclar dos tarjetas en un mismo post.
    setImageUri(null);
    setImageUrl(null);
    setBibleAttachment(passage);
  };

  const canPost = (text.trim().length > 0 || !!imageUrl || !!bibleAttachment) && !uploadingImage && !posting;

  const handlePost = async () => {
    if (!token || !canPost) return;
    setPosting(true);
    try {
      const created = await createPost(token, {
        content: text.trim() || undefined,
        image: imageUrl ?? undefined,
        linked: bibleAttachment
          ? { type: 'bible', verses: bibleAttachment.verses, version: bibleAttachment.version }
          : undefined,
      });
      setFeed('discover', [created, ...discoverFeed]);
      // El backend siempre te incluye a ti mismo en el scope "friends", así que
      // tu propio post nuevo también debe verse ahí sin esperar a un refetch.
      setFeed('friends', [created, ...friendsFeed]);
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'No se pudo publicar');
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border,
          backgroundColor: colors.headerBg,
        }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' }}>Publicar</Text>
          <TouchableOpacity
            onPress={handlePost}
            disabled={!canPost}
            style={{
              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
              backgroundColor: colors.accent, opacity: canPost ? 1 : 0.5,
            }}
          >
            {posting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Publicar</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            {user?.avatar ? (
              <Image source={{ uri: cld(user.avatar, 40) }} style={{ width: 40, height: 40, borderRadius: 20 }} />
            ) : (
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{user?.name?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="¿Qué estás pensando?"
              placeholderTextColor={colors.inputPlaceholder}
              style={{ flex: 1, color: colors.inputText, fontSize: 17, minHeight: 120, textAlignVertical: 'top', paddingTop: 8 }}
              multiline
              autoFocus
              maxLength={4000}
            />
          </View>

          {imageUri && (
            <View style={{ marginTop: 16, position: 'relative' }}>
              <Image source={{ uri: imageUri }} style={{ width: '100%', height: 240, borderRadius: 14 }} resizeMode="cover" />
              {uploadingImage && (
                <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 14 }}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              <TouchableOpacity
                onPress={removeImage}
                style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {bibleAttachment && (
            <View style={{ marginTop: 16, borderRadius: 14, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.accent, padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="bookmark" size={18} color={colors.accent} />
                <Text style={{ color: colors.accent, fontWeight: '700', flex: 1 }}>{bibleAttachment.reference}</Text>
                <TouchableOpacity onPress={() => setBibleAttachment(null)} hitSlop={8}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 14, marginTop: 8, lineHeight: 20 }} numberOfLines={5}>
                {bibleAttachment.verses.map((v) => v.text).join(' ')}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>{bibleAttachment.versionName}</Text>
            </View>
          )}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 24, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
          <TouchableOpacity onPress={pickImage} disabled={!!imageUri || !!bibleAttachment} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: imageUri || bibleAttachment ? 0.4 : 1 }}>
            <Ionicons name="image-outline" size={22} color={colors.accent} />
            <Text style={{ color: colors.accent, fontWeight: '600' }}>Foto</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setBibleOpen(true)} disabled={!!bibleAttachment || !!imageUri} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: bibleAttachment || imageUri ? 0.4 : 1 }}>
            <Ionicons name="bookmark-outline" size={22} color={colors.accent} />
            <Text style={{ color: colors.accent, fontWeight: '600' }}>Versículo</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEmojiOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="happy-outline" size={22} color={colors.accent} />
            <Text style={{ color: colors.accent, fontWeight: '600' }}>Emoji</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <EmojiPicker
        onEmojiSelected={handleEmojiSelected}
        open={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        theme={emojiPickerTheme(colors)}
        enableSearchBar
        enableRecentlyUsed
        categoryPosition="top"
      />

      <BibleModal visible={bibleOpen} onClose={() => setBibleOpen(false)} onSendBible={handleBibleSelected} />
    </SafeAreaView>
  );
}
