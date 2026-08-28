import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Alert, Modal, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store/useAuthStore';
import { cld } from '../../lib/cldImage';
import { parseFormatting, type FmtSegment } from '../../utils/chatFormat';
import { timeAgo } from '../../utils/timeAgo';
import { SocioTag } from '../SocioTag';
import ShareSheet, { WEB_URL } from '../ShareSheet';
import { reactToPost, savePost, hidePost, deletePost, sharePost, type Post, type PostReaction, type PostLinked } from '../../services/postService';
import { ReactionsBar, QuickReactionRow, emojiPickerTheme } from './reactions';
import { ImageViewerModal } from './ImageViewerModal';
import { PostOptionsSheet } from './PostOptionsSheet';
import { PostLinkPreview } from './PostLinkPreview';
import { PostVideo } from './PostVideo';
import { extractLinks } from '../../lib/linkMeta';
import { cleanUrl, isVideoUrl } from '../../lib/postMedia';

const LINKED_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  activity: 'flame', plan: 'book', prayer: 'hand-left', answered: 'checkmark-circle',
  seminar: 'school', material: 'library', bible: 'bookmark',
};

const TEXT_LIMIT = 260;

// Los posts creados en la web guardan HTML de Quill (`<p>...</p>`, `&nbsp;`).
// Los del móvil son texto plano con *negrita*/_cursiva_/~tachado~. `isRichText`
// distingue cuál es cuál — sin esto, un post de la web se veía con las
// etiquetas y entidades literales en pantalla.
function htmlToPlainText(html: string): string {
  return html
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function FormattedText({ text, truncate, colors, isRichText }: { text: string; truncate: boolean; colors: any; isRichText?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const plain = useMemo(() => (isRichText ? htmlToPlainText(text) : text), [text, isRichText]);
  const full = useMemo(() => parseFormatting(plain), [plain]);

  const { segs, wasTruncated } = useMemo(() => {
    if (!truncate || expanded) return { segs: full, wasTruncated: false };
    let left = TEXT_LIMIT;
    let cut = false;
    const out: FmtSegment[] = [];
    for (const seg of full) {
      if (left <= 0) { cut = true; break; }
      const t = seg.text.length > left ? seg.text.slice(0, left) : seg.text;
      if (t) out.push({ ...seg, text: t });
      if (t.length < seg.text.length) cut = true;
      left -= t.length;
    }
    return { segs: out, wasTruncated: cut };
  }, [full, truncate, expanded]);

  return (
    <Text style={{ color: colors.textPrimary, fontSize: 15, lineHeight: 21 }}>
      {segs.map((s, i) => (
        <Text
          key={i}
          style={{
            fontWeight: s.bold ? '700' : '400',
            fontStyle: s.italic ? 'italic' : 'normal',
            textDecorationLine: s.strike ? 'line-through' : 'none',
          }}
        >
          {s.text}
        </Text>
      ))}
      {wasTruncated && (
        <Text onPress={() => setExpanded(true)} style={{ color: colors.accent, fontWeight: '600' }}> Ver más</Text>
      )}
    </Text>
  );
}

function LinkedCard({ linked, colors }: { linked: PostLinked; colors: any }) {
  const onPress = () => {
    if (linked.url && linked.url.startsWith('/')) {
      try { router.push(linked.url as any); } catch {}
    }
  };

  // Tarjeta bíblica: pasaje completo, cita destacada — igual de protagonista
  // que en la web, no un enlace chico más.
  if (linked.type === 'bible') {
    const text = linked.verses?.length ? linked.verses.map((v) => v.text).join(' ') : linked.text;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={{
          marginTop: 10, borderRadius: 14, padding: 16,
          backgroundColor: colors.accent + '12',
          borderLeftWidth: 4, borderLeftColor: colors.accent,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Ionicons name="bookmark" size={16} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>{linked.title}</Text>
        </View>
        {!!text && (
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontStyle: 'italic', lineHeight: 21 }}>“{text}”</Text>
        )}
        {!!linked.version && <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>{linked.version}</Text>}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.bgTertiary, borderRadius: 14, padding: 14, marginTop: 10,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={LINKED_ICON[linked.type ?? 'activity'] ?? 'link'} size={20} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: '700' }} numberOfLines={2}>{linked.title || 'Ver más'}</Text>
        {!!linked.groupName && <Text style={{ color: colors.textMuted, fontSize: 12 }}>{linked.groupName}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export function PostCard({
  post, onChange, onRemove, truncate = true,
}: {
  post: Post;
  onChange: (post: Post) => void;
  onRemove: (postId: string) => void;
  truncate?: boolean;
}) {
  const { colors } = useTheme();
  const { token, user } = useAuthStore();
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [reactionSheetOpen, setReactionSheetOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const [imgContainerWidth, setImgContainerWidth] = useState(0);

  const isOwner = post.author._id === user?.id;

  // `post.image` guarda CUALQUIER adjunto, no solo fotos: un video iba a un
  // `<Image>` y dejaba un hueco vacío (en la web, un enlace que descargaba).
  const attachment = cleanUrl(post.image);
  const attachmentIsVideo = isVideoUrl(post.image);

  // Alto de la imagen según su relación de aspecto real — antes se recortaba
  // siempre a 220dp de alto con resizeMode="cover".
  useEffect(() => {
    if (!attachment || attachmentIsVideo) { setImgAspect(null); return; }
    let cancelled = false;
    Image.getSize(
      attachment,
      (w, h) => { if (!cancelled && w > 0 && h > 0) setImgAspect(w / h); },
      () => {}
    );
    return () => { cancelled = true; };
  }, [attachment, attachmentIsVideo]);

  const applyReactionResult = (result: { likes: any[]; reactions: PostReaction[] }) => {
    const uid = user?.id ?? '';
    const likeIds = result.likes.map((u: any) => (typeof u === 'string' ? u : u._id));
    onChange({ ...post, likes: likeIds, reactions: result.reactions, isLiked: likeIds.includes(uid) });
  };

  const handleReact = async (emoji: string) => {
    if (!token) return;
    setReactionSheetOpen(false);
    setEmojiPickerOpen(false);
    try {
      const result = await reactToPost(token, post._id, emoji);
      applyReactionResult(result);
    } catch {
      Alert.alert('Error', 'No se pudo reaccionar');
    }
  };

  const handleSave = async () => {
    if (!token) return;
    try {
      const { saved } = await savePost(token, post._id);
      onChange({ ...post, isSaved: saved });
    } catch {
      Alert.alert('Error', 'No se pudo guardar');
    }
  };

  const handleHide = async () => {
    if (!token) return;
    try {
      await hidePost(token, post._id);
      onRemove(post._id);
    } catch {
      Alert.alert('Error', 'No se pudo ocultar');
    }
  };

  const handleDelete = () => {
    Alert.alert('Eliminar publicación', '¿Seguro que quieres eliminar esta publicación?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          if (!token) return;
          try {
            await deletePost(token, post._id);
            onRemove(post._id);
          } catch {
            Alert.alert('Error', 'No se pudo eliminar');
          }
        },
      },
    ]);
  };

  const handleOpenShare = () => {
    setShareOpen(true);
    if (token) sharePost(token, post._id, 'webshare').catch(() => {});
  };

  const openDetail = () => router.push(`/post/${post._id}` as any);
  const openProfile = () => router.push(`/profile/${post.author._id}` as any);

  const commentCount = post.comments?.length ?? 0;
  const links = useMemo(() => extractLinks(post.content), [post.content]);

  return (
    <View style={{ backgroundColor: colors.bgSecondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 }}>
      {/* Autor */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={openProfile} activeOpacity={0.8}>
          {post.author.avatar ? (
            <Image source={{ uri: cld(post.author.avatar, 42) }} style={{ width: 42, height: 42, borderRadius: 21 }} />
          ) : (
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{post.author.name?.[0]?.toUpperCase() ?? '?'}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={openProfile} activeOpacity={0.8} style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14.5 }}>{post.author.name}</Text>
            {post.author.isSocio && <SocioTag showText={false} size={13} />}
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{timeAgo(post.createdAt)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setOptionsOpen(true)} hitSlop={8} style={{ padding: 4 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Vistas previas de los enlaces del texto — igual que la web, van sobre
          el texto (que sigue mostrando el enlace escrito). */}
      {links.map((link) => (
        <PostLinkPreview key={link} url={link} colors={colors} />
      ))}

      {/* Texto */}
      {!!post.content && (
        <View style={{ marginTop: 10 }}>
          <FormattedText text={post.content} truncate={truncate} colors={colors} isRichText={post.isRichText} />
        </View>
      )}

      {/* Video adjunto — se reproduce aquí mismo, como en Facebook */}
      {attachmentIsVideo && <PostVideo url={attachment} colors={colors} />}

      {/* Imagen — alto según su relación de aspecto real, para no recortarla */}
      {!!attachment && !attachmentIsVideo && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setImageViewerOpen(true)}
          onLayout={(e) => setImgContainerWidth(e.nativeEvent.layout.width)}
          style={{ marginTop: 10 }}
        >
          <Image
            source={{ uri: cld(attachment, Math.round(imgContainerWidth) || 360) }}
            style={{
              width: '100%',
              height: imgAspect && imgContainerWidth
                ? Math.min(480, Math.max(160, imgContainerWidth / imgAspect))
                : 220,
              borderRadius: 12,
              backgroundColor: colors.bgTertiary,
            }}
            resizeMode="cover"
          />
        </TouchableOpacity>
      )}

      {/* Tarjeta enlazada (actividad/oración/plan/etc.) */}
      {!!post.linked?.type && <LinkedCard linked={post.linked} colors={colors} />}

      {/* Reacciones */}
      <ReactionsBar reactions={post.reactions} currentUserId={user?.id ?? ''} colors={colors} onReact={handleReact} />

      {/* Comentarios */}
      {commentCount > 0 && (
        <TouchableOpacity onPress={openDetail} style={{ marginTop: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            Ver {commentCount === 1 ? 'el comentario' : `los ${commentCount} comentarios`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Acciones */}
      <View style={{ flexDirection: 'row', marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 4 }}>
        <TouchableOpacity
          onPress={() => handleReact('👍')}
          onLongPress={() => setReactionSheetOpen(true)}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10 }}
        >
          <Ionicons name={post.isLiked ? 'heart' : 'heart-outline'} size={19} color={post.isLiked ? colors.danger : colors.textSecondary} />
          <Text style={{ color: post.isLiked ? colors.danger : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
            {post.likes.length > 0 ? post.likes.length : 'Me gusta'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={openDetail} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10 }}>
          <Ionicons name="chatbubble-outline" size={17} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
            {commentCount > 0 ? commentCount : 'Comentar'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleOpenShare} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10 }}>
          <Ionicons name="share-social-outline" size={17} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
            {post.sharedBy.length > 0 ? post.sharedBy.length : 'Compartir'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Hoja de reacción rápida (toque largo en "Me gusta") */}
      <Modal visible={reactionSheetOpen} transparent animationType="fade" onRequestClose={() => setReactionSheetOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' }} onPress={() => setReactionSheetOpen(false)}>
          <Pressable onPress={() => {}}>
            <View style={{ backgroundColor: colors.actionSheetBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingVertical: 12 }}>
              <QuickReactionRow colors={colors} onSelect={handleReact} />
              <TouchableOpacity
                onPress={() => { setReactionSheetOpen(false); setEmojiPickerOpen(true); }}
                style={{ alignItems: 'center', paddingVertical: 12 }}
              >
                <Text style={{ color: colors.accent, fontWeight: '600' }}>Más emojis</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <EmojiPicker
        onEmojiSelected={(e: EmojiType) => handleReact(e.emoji)}
        open={emojiPickerOpen}
        onClose={() => setEmojiPickerOpen(false)}
        theme={emojiPickerTheme(colors)}
        enableSearchBar
        enableRecentlyUsed
        categoryPosition="top"
      />

      <ImageViewerModal visible={imageViewerOpen} url={attachment} onClose={() => setImageViewerOpen(false)} />

      <PostOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        isOwner={isOwner}
        isSaved={post.isSaved}
        onDelete={isOwner ? handleDelete : undefined}
        onSave={handleSave}
        onHide={!isOwner ? handleHide : undefined}
        onReport={!isOwner ? () => Alert.alert('Reporte enviado', 'Gracias por avisarnos, lo revisaremos pronto.') : undefined}
      />

      <ShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        url={`${WEB_URL}/p/${post._id}`}
        title="Compartir publicación"
        message={`Mira esta publicación de ${post.author.name} en HolyChat`}
      />
    </View>
  );
}
