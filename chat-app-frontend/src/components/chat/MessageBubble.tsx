import { useRef, useEffect, memo } from 'react';
import { View, Text, TouchableOpacity, Pressable, Image, Linking, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message, MessageReplyTo, Reaction, ChatUser } from '../../services/conversationService';
import { VoicePlayer } from './VoicePlayer';
import { useTheme } from '../../context/ThemeContext';

const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const YOUTUBE_REGEX =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const EMOJI_ONLY_REGEX = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;

// Light mode — dentro de burbuja (fondo blanco): oscuros saturados sin azul
const BUBBLE_COLORS_LIGHT = [
  '#C62828', // rojo
  '#AD1457', // rosa
  '#6A1B9A', // morado
  '#2E7D32', // verde bosque
  '#E65100', // naranja
  '#00695C', // teal
  '#4E342E', // marrón
  '#F9A825', // ámbar
];

// Dark mode — dentro de burbuja (fondo #ECECEC claro): saturados que se leen sobre gris claro
const BUBBLE_COLORS_DARK = [
  '#2E7D32', // verde medio
  '#00838F', // celeste/teal medio
  '#F57F17', // ámbar/naranja
  '#6A1B9A', // morado medio
];

// Dark mode — etiqueta sobre el fondo del chat (fondo muy oscuro):
// Exactamente lo que pide el usuario: blanco, verde claro, celeste, amarillo
const LABEL_COLORS_DARK = [
  '#FFFFFF', // blanco
  '#A5D6A7', // verde claro
  '#80DEEA', // celeste claro
  '#FFD740', // amarillo
];

function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xFFFFFF;
  return Math.abs(h);
}

// Nombre DENTRO de burbuja
function bubbleNameColor(key: string, isDark: boolean): string {
  const p = isDark ? BUBBLE_COLORS_DARK : BUBBLE_COLORS_LIGHT;
  return p[hashStr(key) % p.length];
}

// Etiqueta SOBRE el fondo del chat (para media: imagen/audio/doc)
function labelNameColor(key: string, isDark: boolean): string {
  if (isDark) return LABEL_COLORS_DARK[hashStr(key) % LABEL_COLORS_DARK.length];
  return BUBBLE_COLORS_LIGHT[hashStr(key) % BUBBLE_COLORS_LIGHT.length];
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

function isEmojiOnly(text: string): boolean {
  return EMOJI_ONLY_REGEX.test(text.trim()) && text.trim().length > 0;
}

function splitByUrls(text: string): Array<{ type: 'text' | 'url'; value: string }> {
  const parts: Array<{ type: 'text' | 'url'; value: string }> = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(URL_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) });
    parts.push({ type: 'url', value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function docIcon(name?: string): string {
  const ext = name?.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['doc', 'docx'].includes(ext ?? '')) return '📝';
  if (['xls', 'xlsx'].includes(ext ?? '')) return '📊';
  if (['ppt', 'pptx'].includes(ext ?? '')) return '📊';
  return '📎';
}

function ReplyPreview({ reply, isMine, colors }: { reply: MessageReplyTo; isMine: boolean; colors: any }) {
  const previewContent = () => {
    if (reply.type === 'image') return '🖼️ Imagen';
    if (reply.type === 'audio') return '🎤 Nota de voz';
    if (reply.type === 'document') return `📄 ${reply.fileName ?? 'Documento'}`;
    if (reply.type === 'call') return '📞 Llamada';
    return reply.content;
  };

  const isDark = colors.bgPrimary === '#0A0A0A';
  const isImageReply = reply.type === 'image';

  // La burbuja del reply siempre tiene fondo claro (blanco en light, #ECECEC en dark)
  // → el nombre usa colores visibles sobre ese fondo, excepto isMine en light (burbuja azul → blanco)
  const replyNameColor = isMine && !isDark ? '#FFFFFF' : bubbleNameColor(reply.senderName, isDark);

  let bg: string, nameTxt: string, contentTxt: string, border: string;

  if (isMine && !isDark) {
    bg = 'rgba(255,255,255,0.22)';
    nameTxt = '#FFFFFF';
    contentTxt = 'rgba(255,255,255,0.85)';
    border = 'rgba(255,255,255,0.55)';
  } else if (isMine && isDark) {
    bg = 'rgba(0,0,0,0.14)';
    nameTxt = replyNameColor;
    contentTxt = '#555555';
    border = replyNameColor;
  } else if (!isMine && !isDark) {
    bg = '#EEF2FF';
    nameTxt = replyNameColor;
    contentTxt = '#475569';
    border = replyNameColor;
  } else {
    bg = 'rgba(0,0,0,0.08)';
    nameTxt = replyNameColor;
    contentTxt = '#555555';
    border = replyNameColor;
  }

  return (
    <View style={{
      borderLeftWidth: 3, borderLeftColor: border,
      backgroundColor: bg, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: isImageReply ? 6 : 5,
      marginBottom: 6, marginHorizontal: 2,
      flexDirection: 'row', alignItems: 'center',
    }}>
      <View style={{ flex: 1, marginRight: isImageReply ? 8 : 0 }}>
        <Text style={{
          color: nameTxt,
          fontSize: isImageReply ? 13 : 12,
          fontWeight: '800',
          marginBottom: isImageReply ? 3 : 1,
          letterSpacing: isImageReply ? 0.1 : 0,
        }}>
          {reply.senderName}
        </Text>
        <Text style={{ color: contentTxt, fontSize: 12 }} numberOfLines={1}>
          {previewContent()}
        </Text>
      </View>
      {isImageReply && (
        <Image
          source={{ uri: reply.content }}
          style={{ width: 48, height: 48, borderRadius: 7 }}
          resizeMode="cover"
        />
      )}
    </View>
  );
}

function AnimatedReactionPill({
  emoji, count, reacted, isMine, colors, onPress, onDetail,
}: {
  emoji: string; count: number; reacted: boolean;
  isMine: boolean; colors: any;
  onPress: (e: string) => void;
  onDetail?: (e: string) => void;
}) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1, useNativeDriver: true, damping: 9, stiffness: 200,
    }).start();
  }, []);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 75, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 220 }),
    ]).start();
    if (reacted && onDetail) {
      onDetail(emoji);
    } else {
      onPress(emoji);
    }
  };

  const isDark = colors.bgPrimary === '#0A0A0A';

  let pillBg: string, pillBorder: string, countColor: string;
  if (reacted && isMine && !isDark) {
    pillBg = colors.accent + '20'; pillBorder = colors.accent; countColor = colors.accent;
  } else if (reacted && isMine && isDark) {
    pillBg = colors.accent + '30'; pillBorder = colors.accent; countColor = colors.accent;
  } else if (reacted && !isMine) {
    pillBg = colors.accent + '18'; pillBorder = colors.accent; countColor = colors.accent;
  } else if (!reacted && isMine && !isDark) {
    pillBg = colors.bgSecondary; pillBorder = colors.border; countColor = colors.textSecondary;
  } else if (!reacted && isMine && isDark) {
    pillBg = 'rgba(0,0,0,0.10)'; pillBorder = colors.border; countColor = colors.textSecondary;
  } else {
    pillBg = colors.bgTertiary; pillBorder = colors.border; countColor = colors.textSecondary;
  }

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.75}>
      <Animated.View style={{
        transform: [{ scale }],
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: pillBg, borderWidth: 1, borderColor: pillBorder,
        borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3,
      }}>
        <Text style={{ fontSize: 15 }}>{emoji}</Text>
        {count > 1 && (
          <Text style={{ color: countColor, fontSize: 11, fontWeight: '700' }}>{count}</Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

function ReactionsBar({
  reactions, currentUserId, isMine, colors, onReact, onReactDetail,
}: {
  reactions: Reaction[]; currentUserId: string;
  isMine: boolean; colors: any;
  onReact: (emoji: string) => void;
  onReactDetail?: (emoji: string) => void;
}) {
  if (!reactions.length) return null;
  return (
    <View style={{
      flexDirection: 'row', flexWrap: 'wrap', gap: 4,
      marginTop: 3, paddingHorizontal: 4,
      justifyContent: isMine ? 'flex-end' : 'flex-start',
    }}>
      {reactions.map((r) => (
        <AnimatedReactionPill
          key={r.emoji}
          emoji={r.emoji}
          count={r.users.length}
          reacted={r.users.includes(currentUserId)}
          isMine={isMine}
          colors={colors}
          onPress={onReact}
          onDetail={onReactDetail}
        />
      ))}
    </View>
  );
}

function SenderAvatar({ name, avatar, colors }: { name: string; avatar?: string; colors: any }) {
  if (avatar) {
    return (
      <Image
        source={{ uri: avatar }}
        style={{ width: 32, height: 32, borderRadius: 8, marginRight: 10, marginTop: 2 }}
      />
    );
  }
  return (
    <View style={{
      width: 32, height: 32, borderRadius: 8,
      backgroundColor: colors.avatarBg,
      alignItems: 'center', justifyContent: 'center',
      marginRight: 6, marginTop: 2,
    }}>
      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>
        {name?.[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
}

function formatCallDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} seg`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins} min ${secs} seg` : `${mins} min`;
}

interface Props {
  item: Message;
  isMine: boolean;
  currentUserId: string;
  isGroup?: boolean;
  onLongPress: (msg: Message) => void;
  onDownload: (msg: Message) => void;
  showAvatar?: boolean;
  onCallBack?: (msg: Message) => void;
  onReact?: (msg: Message, emoji: string) => void;
  onReactDetail?: (msg: Message, emoji: string) => void;
  onAvatarPress?: (sender: ChatUser) => void;
  highlighted?: boolean;
}

function MessageBubbleComponent({ item, isMine, currentUserId, isGroup = false, onLongPress, onDownload, showAvatar = true, onCallBack, onReact, onReactDetail, onAvatarPress, highlighted = false }: Props) {
  const { colors } = useTheme();
  const isDark = colors.bgPrimary === '#0A0A0A';
  const senderColorKey = item.senderId._id;

  const deletedForMe = item.deletedFor?.includes(currentUserId);
  if (deletedForMe) return null;

  const isDeleted = item.isDeletedForEveryone;
  const isImage = item.type === 'image';
  const isAudio = item.type === 'audio';
  const isDocument = item.type === 'document';
  const isText = item.type === 'text';
  const isCall = item.type === 'call';
  const isMedia = isImage || isAudio || isDocument;

  const emojiOnly = isText && !isDeleted && isEmojiOnly(item.content);
  const parts = isText && !isDeleted ? splitByUrls(item.content) : [];
  const youtubeIds = parts
    .filter((p) => p.type === 'url')
    .map((p) => extractYouTubeId(p.value))
    .filter(Boolean) as string[];

  const senderLabel = isMine ? 'Tú' : item.senderId.name;

  const bubbleBg = isMine ? colors.bubbleMine : colors.bubbleTheirs;
  const bubbleText = isMine ? colors.bubbleMineText : colors.bubbleTheirsText;
  const bubbleSubtext = isMine ? colors.bubbleMineSubtext : colors.bubbleTheirsSubtext;

  const bubbleShadow = !isMine ? {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.10,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
  } : {
    shadowColor: colors.bubbleMineShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.38,
    shadowRadius: 10,
    elevation: 4,
  };

  const timestamp = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
      {isText && !isDeleted && item.editedAt && (
        <Text style={{ color: bubbleSubtext, fontSize: 10, fontStyle: 'italic' }}>editado</Text>
      )}
      <Text style={{ color: emojiOnly ? colors.textMuted : bubbleSubtext, fontSize: 10 }}>
        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
      {isMine && !isDeleted && (
        <Text style={{ color: item.status === 'read' ? colors.statusRead : (emojiOnly ? colors.textMuted : bubbleSubtext), fontSize: 10 }}>
          {item.status === 'sent' ? '✓' : '✓✓'}
        </Text>
      )}
    </View>
  );

  const bubbleContent = (
    <>
      {/* IMAGE */}
      {isImage && !isDeleted && (
        <Pressable
          onPress={() => Linking.openURL(item.content)}
          onLongPress={() => onLongPress(item)}
          delayLongPress={400}
          style={[{
            borderRadius: 18, overflow: 'hidden',
            borderTopRightRadius: isMine ? 4 : 18,
            borderTopLeftRadius: isMine ? 18 : 4,
            backgroundColor: bubbleBg,
          }, bubbleShadow, { width: 224 }]}
        >
          {item.replyTo && (
            <View style={{ paddingHorizontal: 8, paddingTop: 8 }}>
              <ReplyPreview reply={item.replyTo} isMine={isMine} colors={colors} />
            </View>
          )}
          <Image source={{ uri: item.content }} style={{ width: 224, height: 224 }} resizeMode="cover" />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: bubbleBg }}>
            <Text style={{ color: bubbleSubtext, fontSize: 12, flex: 1, marginRight: 8 }} numberOfLines={1}>
              {item.fileName ?? 'Imagen'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {timestamp}
              <TouchableOpacity onPress={() => onDownload(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: bubbleSubtext, fontSize: 16 }}>⬇</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      )}

      {/* AUDIO */}
      {isAudio && !isDeleted && (
        <Pressable
          onLongPress={() => onLongPress(item)}
          delayLongPress={400}
          style={[{
            borderRadius: 18, overflow: 'hidden',
            borderTopRightRadius: isMine ? 4 : 18,
            borderTopLeftRadius: isMine ? 18 : 4,
            paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4,
            backgroundColor: bubbleBg, minWidth: 200,
          }, bubbleShadow]}
        >
          {item.replyTo && <ReplyPreview reply={item.replyTo} isMine={isMine} colors={colors} />}
          <VoicePlayer uri={item.content} isMine={isMine} onLongPress={() => onLongPress(item)} />
          <View style={{ marginTop: 2 }}>{timestamp}</View>
        </Pressable>
      )}

      {/* DOCUMENT */}
      {isDocument && !isDeleted && (
        <Pressable
          onLongPress={() => onLongPress(item)}
          delayLongPress={400}
          style={[{
            borderRadius: 18, overflow: 'hidden',
            borderTopRightRadius: isMine ? 4 : 18,
            borderTopLeftRadius: isMine ? 18 : 4,
            backgroundColor: bubbleBg, width: 260,
          }, bubbleShadow]}
        >
          {item.replyTo && (
            <View style={{ paddingHorizontal: 8, paddingTop: 8 }}>
              <ReplyPreview reply={item.replyTo} isMine={isMine} colors={colors} />
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 12 }}>
            <Text style={{ fontSize: 36 }}>{docIcon(item.fileName)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: bubbleText, fontSize: 14, fontWeight: '600' }} numberOfLines={3}>
                {item.fileName ?? 'Documento'}
              </Text>
              {item.fileSize ? (
                <Text style={{ color: bubbleSubtext, fontSize: 11, marginTop: 2 }}>{formatFileSize(item.fileSize)}</Text>
              ) : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: isMine ? 'rgba(0,0,0,0.06)' : colors.borderLight }}>
            {timestamp}
            <TouchableOpacity
              onPress={() => onDownload(item)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginLeft: 8, backgroundColor: colors.accent }}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={{ color: '#fff', fontSize: 12 }}>⬇</Text>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Descargar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      )}

      {/* CALL */}
      {isCall && !isDeleted && (
        <Pressable
          onLongPress={() => onLongPress(item)}
          delayLongPress={400}
          style={[{
            borderRadius: 18, overflow: 'hidden',
            borderTopRightRadius: isMine ? 4 : 18,
            borderTopLeftRadius: isMine ? 18 : 4,
            backgroundColor: bubbleBg, width: 260,
          }, bubbleShadow]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 }}>
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: item.callStatus === 'missed' ? '#ef4444' : '#22c55e',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons
                name={item.callType === 'video' ? 'videocam' : 'call'}
                size={20}
                color="#fff"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: bubbleText, fontSize: 15, fontWeight: '600' }}>
                {item.callStatus === 'missed'
                  ? 'Llamada perdida'
                  : `Llamada de ${item.callType === 'video' ? 'video' : 'audio'}`}
              </Text>
              {item.callStatus === 'missed' ? (
                <TouchableOpacity onPress={() => onCallBack?.(item)} activeOpacity={0.7}>
                  <Text style={{ color: colors.accent, fontSize: 12, marginTop: 2 }}>
                    Toca para volver a llamar
                  </Text>
                </TouchableOpacity>
              ) : item.callDuration != null ? (
                <Text style={{ color: bubbleSubtext, fontSize: 12, marginTop: 2 }}>
                  {formatCallDuration(item.callDuration)}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>{timestamp}</View>
        </Pressable>
      )}
      {isCall && isDeleted && (
        <Pressable
          onLongPress={() => onLongPress(item)}
          delayLongPress={400}
          style={[{
            borderRadius: 18, overflow: 'hidden',
            borderTopRightRadius: isMine ? 4 : 18,
            borderTopLeftRadius: isMine ? 18 : 4,
            backgroundColor: bubbleBg, width: 260,
          }, bubbleShadow]}
        >
          <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ color: bubbleSubtext, fontStyle: 'italic', fontSize: 14 }}>
              {isMine ? '🚫 Eliminaste este mensaje' : '🚫 Mensaje eliminado'}
            </Text>
          </View>
          <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>{timestamp}</View>
        </Pressable>
      )}

      {/* TEXT */}
      {isText && (
        <Pressable
          onLongPress={() => onLongPress(item)}
          delayLongPress={400}
          style={emojiOnly ? {} : [
            {
              maxWidth: '100%', borderRadius: 18, overflow: 'hidden',
              borderTopRightRadius: isMine ? 4 : 18,
              borderTopLeftRadius: isMine ? 18 : 4,
              backgroundColor: bubbleBg,
              minWidth: item.replyTo ? 210 : undefined,
            },
            bubbleShadow,
          ]}
        >
          {youtubeIds.map((videoId) => (
            <TouchableOpacity
              key={videoId}
              onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`)}
              activeOpacity={0.85}
            >
              <View style={{ position: 'relative' }}>
                <Image
                  source={{ uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }}
                  style={{ width: 256, height: 144 }}
                  resizeMode="cover"
                />
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 20, marginLeft: 4 }}>▶</Text>
                  </View>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.7)' }}>
                  <Text style={{ color: '#fff', fontSize: 12 }} numberOfLines={1}>
                    youtube.com/watch?v={videoId}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}

          <View style={emojiOnly ? {} : { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
            {!isMine && !emojiOnly && (
              <Text style={{
                color: bubbleNameColor(senderColorKey, isDark),
                fontSize: 12.5,
                fontWeight: '800',
                marginBottom: item.replyTo && !isDeleted ? 4 : 2,
                letterSpacing: 0.1,
              }}>
                {item.senderId.name}
              </Text>
            )}
            {!emojiOnly && !isDeleted && item.replyTo && (
              <ReplyPreview reply={item.replyTo} isMine={isMine} colors={colors} />
            )}
            {isDeleted ? (
              <Text style={{ color: bubbleSubtext, fontStyle: 'italic', fontSize: 14, paddingHorizontal: 4 }}>
                {isMine ? '🚫 Eliminaste este mensaje' : '🚫 Mensaje eliminado'}
              </Text>
            ) : (
              <Text style={emojiOnly ? { fontSize: 40 } : { color: bubbleText, fontSize: 16 }}>
                {parts.map((part, i) =>
                  part.type === 'url' ? (
                    <Text
                      key={i}
                      style={{ color: isMine ? 'rgba(255,255,255,0.85)' : colors.accent, textDecorationLine: 'underline' }}
                      onPress={() => Linking.openURL(part.value)}
                    >
                      {part.value}
                    </Text>
                  ) : (
                    <Text key={i}>{part.value}</Text>
                  )
                )}
              </Text>
            )}
            {!emojiOnly && <View style={{ marginTop: 2 }}>{timestamp}</View>}
            {emojiOnly && <View style={{ marginTop: 2 }}>{timestamp}</View>}
          </View>
        </Pressable>
      )}
    </>
  );

  const reactionsBar = item.reactions?.length ? (
    <ReactionsBar
      reactions={item.reactions}
      currentUserId={currentUserId}
      isMine={isMine}
      colors={colors}
      onReact={(emoji) => onReact?.(item, emoji)}
      onReactDetail={(emoji) => onReactDetail?.(item, emoji)}
    />
  ) : null;

  // Resaltado temporal al llegar desde el buscador (ámbar translúcido, legible en
  // light y dark).
  const highlightStyle = highlighted
    ? { backgroundColor: 'rgba(255,214,64,0.22)', borderRadius: 10, paddingVertical: 4 }
    : null;

  if (isMine) {
    return (
      <View style={[{ marginBottom: 4, paddingHorizontal: 12, alignItems: 'flex-end' }, highlightStyle]}>
        {isMedia && !isDeleted && (
          <Text style={{ fontSize: 11, fontWeight: '700', marginBottom: 2, paddingHorizontal: 4, color: colors.textMuted }}>
            Tú
          </Text>
        )}
        {bubbleContent}
        {reactionsBar}
      </View>
    );
  }

  // Received message: avatar on the left
  return (
    <View style={[{ marginBottom: 6, paddingHorizontal: 12 }, highlightStyle]}>
      {isMedia && !isDeleted && (
        <Text style={{
          fontSize: 12,
          fontWeight: '800',
          marginBottom: 2,
          paddingHorizontal: 36,
          color: labelNameColor(senderColorKey, isDark),
          letterSpacing: 0.1,
        }}>
          {senderLabel}
        </Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', maxWidth: '82%' }}>
        {showAvatar ? (
          <TouchableOpacity
            onPress={() => onAvatarPress?.(item.senderId)}
            activeOpacity={onAvatarPress ? 0.7 : 1}
            disabled={!onAvatarPress}
          >
            <SenderAvatar
              name={item.senderId.name}
              avatar={item.senderId.avatar}
              colors={colors}
            />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 38 }} />
        )}
        <View style={{ flex: 1 }}>
          {bubbleContent}
          {reactionsBar}
        </View>
      </View>
    </View>
  );
}

// Memoizado: las burbujas solo se re-renderizan cuando cambia su propio mensaje
// (los objetos Message se reemplazan de forma inmutable en el store) o una de
// sus props primitivas. Evita re-renderizar toda la lista en cada scroll/typing.
export const MessageBubble = memo(MessageBubbleComponent);
