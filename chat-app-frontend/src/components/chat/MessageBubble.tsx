import { useRef, useEffect, useState, useMemo, memo } from 'react';
import { View, Text, TouchableOpacity, Pressable, Image, Linking, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message, MessageReplyTo, Reaction, ChatUser, SharedContact } from '../../services/conversationService';
import { VoicePlayer } from './VoicePlayer';
import { LinkPreview } from './LinkPreview';
import { useTheme } from '../../context/ThemeContext';
import { parseFormatting } from '../../utils/chatFormat';
import { splitMentions } from '../../utils/mentions';
import { PollBubble } from './PollBubble';

const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const EMOJI_ONLY_REGEX = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;

// Colores de nombre por usuario, estilo WhatsApp — IDÉNTICOS a la web
// (holy_app `messages/Message.jsx`). En claro son tonos saturados; en oscuro,
// tonos claros que se leen sobre las burbujas/fondo oscuros. El color se asigna
// de forma estable según el NOMBRE (misma clave y mismo hash que la web).
const LIGHT_NAME_COLORS = [
  '#1f7aec', '#7e3ff2', '#1fa855', '#e53935', '#8d6e63',
  '#009688', '#d17c00', '#c2185b',
];
const DARK_NAME_COLORS = [
  '#ffffff', '#ffd54f', '#81c784', '#f48fb1', '#64b5f6',
  '#b39ddb', '#ffb74d', '#4dd0e1',
];

// Mismo hash que la web: h = (h*31 + code) >>> 0, y palette[h % len].
function nameColor(key: string, isDark: boolean): string {
  const palette = isDark ? DARK_NAME_COLORS : LIGHT_NAME_COLORS;
  const s = String(key || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// Se conservan ambos nombres (dentro de burbuja / etiqueta sobre el fondo) pero
// ahora resuelven al MISMO color de la web, para que web y app coincidan.
const bubbleNameColor = nameColor;
const labelNameColor = nameColor;

// Recorte de los mensajes largos ("Ver más"). Vive en el módulo porque el
// troceado del texto (memoizado) lo necesita antes de que se declare nada dentro
// del componente.
const MAX_LENGTH = 250;

// Un trozo del texto ya preparado para pintar: o es una URL, o es texto con sus
// menciones ya marcadas. Se calcula una vez (memoizado) en vez de en cada render.
type TextPart = {
  type: string;
  value: string;
  pieces: ReturnType<typeof splitMentions>;
};

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

function ReplyPreview({ reply, isMine, colors, onPress }: { reply: MessageReplyTo; isMine: boolean; colors: any; onPress?: () => void }) {
  const previewContent = () => {
    if (reply.type === 'image') return '🖼️ Imagen';
    if (reply.type === 'audio') return '🎤 Nota de voz';
    if (reply.type === 'document') return `📄 ${reply.fileName ?? 'Documento'}`;
    if (reply.type === 'call') return '📞 Llamada';
    if (reply.type === 'contact') return `👤 ${reply.content}`;
    return reply.content;
  };

  const isDark = colors.bgPrimary === '#0A0A0A';
  const isImageReply = reply.type === 'image';

  // Cita del mensaje respondido — IDÉNTICA a la web (holy_app Message.jsx):
  //  - fondo: oscuro → rgba(0,0,0,0.22); claro → propia rgba(0,0,0,0.06), ajena #f5f6f6
  //  - barra + nombre: color del autor citado (nameColor)
  //  - contenido: oscuro → rgba(255,255,255,0.72); claro → #5e6b73
  const c = nameColor(reply.senderName, isDark);
  const bg = isDark ? 'rgba(0,0,0,0.22)' : isMine ? 'rgba(0,0,0,0.06)' : '#f5f6f6';
  const nameTxt = c;
  const contentTxt = isDark ? 'rgba(255,255,255,0.72)' : '#5e6b73';
  const border = c;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={!onPress}
      style={{
        borderLeftWidth: 4, borderLeftColor: border,
        backgroundColor: bg, borderRadius: 8,
        paddingHorizontal: 8, paddingVertical: isImageReply ? 6 : 5,
        marginBottom: 6, marginHorizontal: 2,
        flexDirection: 'row', alignItems: isImageReply ? 'center' : 'flex-start',
      }}>
      <View style={{ flex: 1, marginRight: isImageReply ? 8 : 0 }}>
        <Text style={{
          color: nameTxt,
          fontSize: isImageReply ? 13 : 12,
          fontWeight: '700',
          marginBottom: isImageReply ? 3 : 1,
          letterSpacing: isImageReply ? 0.1 : 0,
        }}>
          {reply.senderName}
        </Text>
        <Text style={{ color: contentTxt, fontSize: 12 }} numberOfLines={isImageReply ? 1 : 2}>
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
    </TouchableOpacity>
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
  /** Miembros del grupo, para resaltar las menciones (@nombre) del texto. */
  mentionUsers?: { _id: string; name: string; avatar?: string }[];
  onLongPress: (msg: Message) => void;
  onDownload: (msg: Message) => void;
  showAvatar?: boolean;
  onCallBack?: (msg: Message) => void;
  onReact?: (msg: Message, emoji: string) => void;
  onReactDetail?: (msg: Message, emoji: string) => void;
  onAvatarPress?: (sender: ChatUser) => void;
  onReplyPress?: (messageId?: string) => void;
  /** Votar en una encuesta (índice de la opción tocada). */
  onVote?: (msg: Message, optionIndex: number) => void;
  /** Cerrar la votación (solo el autor; el backend lo vuelve a comprobar). */
  onClosePoll?: (msg: Message) => void;
  /** Botón "Mensaje" de una tarjeta de contacto compartido. */
  onContactPress?: (contact: SharedContact) => void;
  highlighted?: boolean;
}

function MessageBubbleComponent({ item, isMine, currentUserId, isGroup = false, mentionUsers, onLongPress, onDownload, showAvatar = true, onCallBack, onReact, onReactDetail, onAvatarPress, onReplyPress, onContactPress, onVote, onClosePoll, highlighted = false }: Props) {
  const { colors } = useTheme();
  const isDark = colors.bgPrimary === '#0A0A0A';
  const senderColorKey = item.senderId.name;

  // "Ver más": los mensajes de texto largos se recortan (igual que en la web,
  // holy_app Message.jsx) mostrando los primeros MAX_LENGTH caracteres con un
  // botón para expandir. Evita burbujas gigantescas en la lista.
  const [expanded, setExpanded] = useState(false);

  // El texto ya troceado: primero por URLs y, dentro de cada trozo, por menciones.
  //
  // Va en un `useMemo` y ARRIBA DEL TODO por dos razones. La de rendimiento:
  // `splitMentions` recorre TODOS los miembros del grupo (con un `fold()` del texto
  // por nombre), y sin memo eso se repetía en cada render de cada burbuja — en un
  // grupo de 100 miembros, durante el scroll, es trabajo tirado en el hilo de UI.
  // La de corrección: debajo hay un `return null` (mensaje borrado para mí), y un
  // hook después de un return condicional rompe las reglas de los hooks.
  const parts = useMemo<TextPart[]>(() => {
    if (item.type !== 'text' || item.isDeletedForEveryone) return [];
    const full = item.content ?? '';
    const shown = full.length > MAX_LENGTH && !expanded ? full.slice(0, MAX_LENGTH) : full;
    return splitByUrls(shown).map((p) => ({
      ...p,
      // En una URL no hay menciones que buscar.
      pieces: p.type === 'url' ? [] : splitMentions(p.value, mentionUsers ?? []),
    }));
  }, [item.type, item.content, item.isDeletedForEveryone, expanded, mentionUsers]);

  const deletedForMe = item.deletedFor?.includes(currentUserId);
  if (deletedForMe) return null;

  const isDeleted = item.isDeletedForEveryone;
  const isImage = item.type === 'image';
  const isAudio = item.type === 'audio';
  const isDocument = item.type === 'document';
  const isText = item.type === 'text';
  const isCall = item.type === 'call';
  const isContact = item.type === 'contact';
  const isPoll = item.type === 'poll';
  const isMedia = isImage || isAudio || isDocument;
  // El nombre del remitente va encima de la burbuja (no dentro) en todo lo que
  // no es texto plano, porque esas burbujas no dejan hueco para la cabecera.
  const showSenderLabel = isMedia || isContact || isPoll;
  // Tipo que esta versión de la app no sabe pintar (el backend ya lo envía pero
  // el bundle es viejo). Sin esto la burbuja saldría vacía y el mensaje parecería
  // no haber llegado nunca; pasó al estrenar `contact`.
  //
  // OJO: al añadir un tipo hay que registrarlo AQUÍ además de darle su rama. Si se
  // olvida, el tipo nuevo cae en "desconocido" y el usuario ve "Actualiza la
  // aplicación" aunque su app esté al día.
  const isUnknownType = !isMedia && !isText && !isCall && !isContact && !isPoll;

  const emojiOnly = isText && !isDeleted && isEmojiOnly(item.content);
  // Recorte de texto largo (igual que la web): si supera MAX_LENGTH y no está
  // expandido, se muestra solo el inicio + botón "Ver más". El troceado en sí ya
  // está hecho arriba, en `parts` (memoizado).
  const fullText = isText && !isDeleted ? item.content : '';
  const shouldTruncate = isText && !isDeleted && !emojiOnly && fullText.length > MAX_LENGTH;
  const firstUrl = parts.find((p) => p.type === 'url')?.value;

  const senderLabel = isMine ? 'Tú' : item.senderId.name;

  const bubbleBg = isMine ? colors.bubbleMine : colors.bubbleTheirs;
  const bubbleText = isMine ? colors.bubbleMineText : colors.bubbleTheirsText;
  const bubbleSubtext = isMine ? colors.bubbleMineSubtext : colors.bubbleTheirsSubtext;

  // Sombra estilo web: en claro, sombra sutil en ambas burbujas (la ajena, que
  // es blanca, además lleva un borde para separarse del fondo); en oscuro, sin
  // sombra (las burbujas azul/morada ya contrastan con el fondo).
  const bubbleShadow = isDark ? {} : {
    shadowColor: '#0b141a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.13,
    shadowRadius: 1,
    elevation: 1,
    ...(isMine ? {} : { borderWidth: 1, borderColor: colors.borderLight }),
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
              <ReplyPreview reply={item.replyTo} isMine={isMine} colors={colors} onPress={() => onReplyPress?.(item.replyTo?.messageId)} />
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
          {item.replyTo && <ReplyPreview reply={item.replyTo} isMine={isMine} colors={colors} onPress={() => onReplyPress?.(item.replyTo?.messageId)} />}
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
              <ReplyPreview reply={item.replyTo} isMine={isMine} colors={colors} onPress={() => onReplyPress?.(item.replyTo?.messageId)} />
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
      {/* POLL — encuesta (pregunta + opciones votables con sus barras) */}
      {isPoll && !isDeleted && item.poll && (
        <Pressable
          onLongPress={() => onLongPress(item)}
          delayLongPress={400}
          style={[{
            borderRadius: 18,
            borderTopRightRadius: isMine ? 4 : 18,
            borderTopLeftRadius: isMine ? 18 : 4,
            backgroundColor: bubbleBg,
            padding: 12,
            maxWidth: 300,
          }, bubbleShadow]}
        >
          <PollBubble
            poll={item.poll}
            currentUserId={currentUserId}
            colors={colors}
            textColor={bubbleText}
            subtextColor={bubbleSubtext}
            onVote={(optionIndex) => onVote?.(item, optionIndex)}
            // Solo el autor cierra su encuesta. El backend lo vuelve a comprobar
            // (autor o admin del grupo): la UI decide qué se ve, no quién puede.
            canClose={isMine}
            onClose={() => onClosePoll?.(item)}
          />
          <Text style={{ color: bubbleSubtext, fontSize: 10, alignSelf: 'flex-end', marginTop: 6 }}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </Pressable>
      )}

      {/* CONTACT — tarjeta de contacto compartido (foto + nombre + "Mensaje") */}
      {isContact && !isDeleted && (
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
              <ReplyPreview reply={item.replyTo} isMine={isMine} colors={colors} onPress={() => onReplyPress?.(item.replyTo?.messageId)} />
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, gap: 12 }}>
            {item.contact?.avatar ? (
              <Image source={{ uri: item.contact.avatar }} style={{ width: 48, height: 48, borderRadius: 24 }} />
            ) : (
              <View style={{
                width: 48, height: 48, borderRadius: 24,
                backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : colors.avatarBg,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: bubbleText, fontSize: 20, fontWeight: 'bold' }}>
                  {(item.contact?.name ?? item.content)[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: bubbleText, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>
                {item.contact?.name ?? item.content}
              </Text>
              <Text style={{ color: bubbleSubtext, fontSize: 12, marginTop: 2 }}>Contacto</Text>
            </View>
          </View>

          <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>{timestamp}</View>

          <TouchableOpacity
            onPress={() => item.contact && onContactPress?.(item.contact)}
            disabled={!item.contact || !onContactPress}
            style={{
              paddingVertical: 11, alignItems: 'center',
              borderTopWidth: 1,
              borderTopColor: isMine && !isDark ? 'rgba(0,0,0,0.06)' : isDark ? 'rgba(255,255,255,0.18)' : colors.borderLight,
            }}
          >
            {/* En dark la burbuja ya es azul/morada: el acento índigo no contrasta. */}
            <Text style={{ color: isDark ? '#fff' : colors.accent, fontSize: 14, fontWeight: '600' }}>
              Mensaje
            </Text>
          </TouchableOpacity>
        </Pressable>
      )}

      {/* Tipo desconocido: mejor un aviso que una burbuja invisible. */}
      {isUnknownType && !isDeleted && (
        <Pressable
          onLongPress={() => onLongPress(item)}
          delayLongPress={400}
          style={[{
            borderRadius: 18, overflow: 'hidden',
            borderTopRightRadius: isMine ? 4 : 18,
            borderTopLeftRadius: isMine ? 18 : 4,
            backgroundColor: bubbleBg, maxWidth: 280,
          }, bubbleShadow]}
        >
          <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ color: bubbleSubtext, fontStyle: 'italic', fontSize: 14 }}>
              Este mensaje no se puede mostrar. Actualiza la aplicación para verlo.
            </Text>
          </View>
          <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>{timestamp}</View>
        </Pressable>
      )}

      {(isCall || isContact || isUnknownType) && isDeleted && (
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
          {firstUrl && !isDeleted && !emojiOnly && (
            <View style={{ paddingHorizontal: 6, paddingTop: 6 }}>
              <LinkPreview url={firstUrl} isMine={isMine} colors={colors} />
            </View>
          )}

          <View style={emojiOnly ? {} : { paddingHorizontal: 12, paddingTop: firstUrl && !emojiOnly ? 0 : 8, paddingBottom: 4 }}>
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
              <ReplyPreview reply={item.replyTo} isMine={isMine} colors={colors} onPress={() => onReplyPress?.(item.replyTo?.messageId)} />
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
                      style={{ color: isMine && isDark ? 'rgba(255,255,255,0.9)' : colors.accent, textDecorationLine: 'underline' }}
                      onPress={() => Linking.openURL(part.value)}
                    >
                      {part.value}
                    </Text>
                  ) : (
                    // Menciones primero y formato después: una mención es un
                    // nombre, no lleva *negrita* dentro, y así el resaltado no se
                    // parte por la mitad si el nombre contiene un guion bajo.
                    // Ya troceado arriba (memoizado): aquí solo se pinta.
                    part.pieces.map((piece, m) =>
                      piece.mentionOf ? (
                        <Text
                          key={`${i}-m${m}`}
                          style={{
                            // A MÍ la mención me sale más marcada: el objetivo es
                            // que la vea quien está mencionado, no decorar el texto.
                            fontWeight: '700',
                            color:
                              piece.mentionOf === currentUserId
                                ? isMine && isDark
                                  ? '#fff'
                                  : colors.accent
                                : bubbleText,
                          }}
                        >
                          {piece.text}
                        </Text>
                      ) : (
                        // Formato tipo WhatsApp (*negrita*, _cursiva_, ~tachado~)
                        parseFormatting(piece.text).map((seg, j) => (
                          <Text
                            key={`${i}-${m}-${j}`}
                            style={{
                              fontWeight: seg.bold ? '700' : undefined,
                              fontStyle: seg.italic ? 'italic' : undefined,
                              textDecorationLine: seg.strike ? 'line-through' : undefined,
                            }}
                          >
                            {seg.text}
                          </Text>
                        ))
                      )
                    )
                  )
                )}
              </Text>
            )}
            {shouldTruncate && !expanded && !isDeleted && (
              <Text
                onPress={() => setExpanded(true)}
                style={{
                  color: isDark ? '#fde68a' : '#2563eb',
                  fontSize: 13,
                  textDecorationLine: 'underline',
                  marginTop: 4,
                }}
              >
                Ver más
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
        {showSenderLabel && !isDeleted && (
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
      {showSenderLabel && !isDeleted && (
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
