import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DailyTopic } from '../../services/bibleService';
import { PhotoCard, photoCardChip } from './PhotoCard';

// TEMA DEL DÍA (hermano del versículo del día).
//
// El versículo del día es un texto suelto; esto es un PASAJE PARA UN MOMENTO
// ("cumpleaños", "bautismo", "duelo", "ansiedad"…): lo que la gente busca de
// verdad cuando abre la Biblia con una ocasión entre manos. El tema lo decide el
// backend a partir de la fecha, así que es el mismo para toda la comunidad ese
// día, igual que el versículo.
//
// "Compartir" abre las cuatro superficies que ya existen, sin inventar ninguna:
// un grupo, un chat, la comunidad (post) y redes (compartir del sistema).
//
// Espejo de la web: holy_app/frontend/src/components/DailyTopicCard.jsx.

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

export type TopicShareTarget = 'group' | 'chat' | 'post' | 'social';

interface Props {
  topic: DailyTopic | null;
  colors: any;
  onRead: (topic: DailyTopic) => void;
  onShare: (topic: DailyTopic, target: TopicShareTarget) => void;
}

const SHARE_OPTIONS: { target: TopicShareTarget; icon: any; label: string }[] = [
  { target: 'group', icon: 'people-outline', label: 'Enviar a un grupo' },
  { target: 'chat', icon: 'chatbubble-outline', label: 'Enviar a un chat' },
  { target: 'post', icon: 'megaphone-outline', label: 'Publicar en la comunidad' },
  { target: 'social', icon: 'share-social-outline', label: 'Compartir en redes' },
];

export function DailyTopicCard({ topic, colors, onRead, onShare }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (!topic || !topic.passages?.length) return null;

  const sample = topic.passages[0];
  const sampleVerse = sample.verses[0];

  return (
    <>
      <PhotoCard label="Tema del día" photo={null} fallback="#0f766e">
        <Text style={{ color: '#fff', fontSize: 19, fontWeight: '700', marginTop: 8 }}>
          {topic.emoji} {topic.title}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 }}>
          {topic.description}
        </Text>

        {/* Una muestra del tema: la tarjeta tiene que dar algo que LEER, no solo
            un título. El resto de pasajes están a un toque de "Leer". */}
        <Text style={{ color: '#fff', fontSize: 15, lineHeight: 23, marginTop: 12, fontFamily: SERIF }}>
          “{sampleVerse.text}”
        </Text>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 6 }}>
          {sample.label}
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '400' }}>
            {'  '}
            {topic.passages.length} {topic.passages.length === 1 ? 'pasaje' : 'pasajes'}
          </Text>
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
          <TouchableOpacity onPress={() => onRead(topic)} style={photoCardChip}>
            <Ionicons name="book-outline" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Leer</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setMenuOpen(true)} style={photoCardChip}>
            <Ionicons name="share-social-outline" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Compartir</Text>
          </TouchableOpacity>
        </View>
      </PhotoCard>

      {/* A dónde compartir. Grupo y chat son la misma lista de conversaciones
          filtrada; se separan aquí para que quien busca su grupo no tenga que
          rebuscarlo entre los privados. */}
      <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.bgSecondary,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: 32,
            }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                alignSelf: 'center',
                marginTop: 12,
              }}
            />
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: 16,
                fontWeight: '700',
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 4,
              }}
            >
              Compartir “{topic.title}”
            </Text>

            {SHARE_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.target}
                onPress={() => {
                  setMenuOpen(false);
                  onShare(topic, o.target);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 }}
              >
                <Ionicons name={o.icon} size={20} color={colors.textSecondary} />
                <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
