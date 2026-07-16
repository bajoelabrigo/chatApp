import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import type { VerseItem } from '../../constants/bible';

// Acciones de un versículo, en hoja inferior.
//
// Antes esto era una BARRA de una sola fila: 5 círculos de color + hasta 9 iconos.
// En un móvil no caben, así que se salían por la derecha y las últimas acciones
// (memorizar, orar, cerrar) quedaban fuera de la pantalla, sin scroll ni pista de
// que estaban ahí. Con rejilla cabe todo y además cada acción lleva su nombre:
// nueve iconos sin etiqueta tampoco es que se entendieran mucho.
//
// Espejo de la web: holy_app/frontend/src/components/VerseActionsSheet.jsx.
//
// Las acciones que solo tienen sentido con UN versículo (nota, imagen, etiquetas,
// referencias, memorizar, orar) se ocultan al seleccionar varios; resaltar,
// favorito y compartir funcionan con la selección entera.

interface Props {
  count: number;
  /** El único versículo seleccionado (null si hay varios). */
  verse: VerseItem | null;
  colors: any;
  bottomInset: number;
  highlightColors: string[];
  allFav: boolean;
  anyHighlighted: boolean;
  hasNote: boolean;
  hasTags: boolean;
  isMemorized: boolean;
  onClose: () => void;
  onHighlight: (color: string) => void;
  onClearHighlight: () => void;
  onFavorite: () => void;
  onShare: () => void;
  onSendToChat: () => void;
  onNote: (v: VerseItem) => void;
  onImage: (v: VerseItem) => void;
  onTags: (v: VerseItem) => void;
  onXrefs: (v: VerseItem) => void;
  onMemorize: (v: VerseItem) => void;
  onPray: (v: VerseItem) => void;
}

export function VerseActionsSheet({
  count,
  verse,
  colors,
  bottomInset,
  highlightColors,
  allFav,
  anyHighlighted,
  hasNote,
  hasTags,
  isMemorized,
  onClose,
  onHighlight,
  onClearHighlight,
  onFavorite,
  onShare,
  onSendToChat,
  onNote,
  onImage,
  onTags,
  onXrefs,
  onMemorize,
  onPray,
}: Props) {
  if (count === 0) return null;

  // Una acción de la rejilla: icono grande + nombre debajo. `active` la tiñe del
  // color de acento (ya está guardado, ya tiene nota, ya lo memorizas…).
  const Action = ({
    icon,
    label,
    active,
    onPress,
    danger,
  }: {
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    onPress: () => void;
    danger?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{ width: '25%', alignItems: 'center', paddingVertical: 12 }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? colors.accent + '22' : colors.bgTertiary,
          borderWidth: 1,
          borderColor: active ? colors.accent : colors.border,
        }}
      >
        {icon}
      </View>
      <Text
        numberOfLines={1}
        style={{
          color: danger ? colors.danger : active ? colors.accent : colors.textSecondary,
          fontSize: 11,
          marginTop: 6,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const iconColor = (active?: boolean, danger?: boolean) =>
    danger ? colors.danger : active ? colors.accent : colors.textSecondary;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.bgSecondary,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '85%',
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

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: bottomInset + 20 }}>
            {/* Qué versículo se está tocando: al llegar desde una lista (Temas,
                Buscar) el usuario necesita ver que es el correcto. */}
            {verse ? (
              <>
                <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>
                  {verse.book} {verse.chapter}:{verse.verse}
                </Text>
                <Text
                  numberOfLines={2}
                  style={{ color: colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 19 }}
                >
                  {verse.text}
                </Text>
              </>
            ) : (
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>
                {count} versículos seleccionados
              </Text>
            )}

            {/* Resaltar */}
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginTop: 18,
                marginBottom: 10,
              }}
            >
              Resaltar
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {highlightColors.map((color) => (
                <TouchableOpacity
                  key={color}
                  onPress={() => onHighlight(color)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: color,
                    borderWidth: 2,
                    borderColor: colors.border,
                  }}
                />
              ))}
              {anyHighlighted && (
                <TouchableOpacity
                  onPress={onClearHighlight}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: colors.bgTertiary,
                    borderWidth: 2,
                    borderColor: colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="remove" size={18} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>

            {/* Acciones */}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                marginTop: 14,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: 6,
              }}
            >
              <Action
                icon={
                  <FontAwesome5
                    name="star"
                    solid={allFav}
                    size={18}
                    color={allFav ? '#FBBF24' : colors.textSecondary}
                  />
                }
                label={allFav ? 'Guardado' : 'Favorito'}
                active={allFav}
                onPress={onFavorite}
              />

              <Action
                icon={<Ionicons name="share-outline" size={20} color={iconColor()} />}
                label="Compartir"
                onPress={onShare}
              />

              <Action
                icon={<Ionicons name="chatbubble-ellipses-outline" size={20} color={iconColor()} />}
                label="Enviar a chat"
                onPress={onSendToChat}
              />

              {verse && (
                <>
                  <Action
                    icon={<Ionicons name="create-outline" size={20} color={iconColor(hasNote)} />}
                    label="Nota"
                    active={hasNote}
                    onPress={() => onNote(verse)}
                  />
                  <Action
                    icon={<Ionicons name="image-outline" size={20} color={iconColor()} />}
                    label="Imagen"
                    onPress={() => onImage(verse)}
                  />
                  <Action
                    icon={<Ionicons name="pricetag-outline" size={20} color={iconColor(hasTags)} />}
                    label="Etiquetas"
                    active={hasTags}
                    onPress={() => onTags(verse)}
                  />
                  <Action
                    icon={<Ionicons name="git-network-outline" size={20} color={iconColor()} />}
                    label="Referencias"
                    onPress={() => onXrefs(verse)}
                  />
                  <Action
                    icon={<Ionicons name="school-outline" size={20} color={iconColor(isMemorized)} />}
                    label={isMemorized ? 'Memorizando' : 'Memorizar'}
                    active={isMemorized}
                    onPress={() => onMemorize(verse)}
                  />
                  <Action
                    icon={<FontAwesome5 name="pray" size={17} color={iconColor()} />}
                    label="Orar"
                    onPress={() => onPray(verse)}
                  />
                </>
              )}
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={{
                marginTop: 10,
                paddingVertical: 14,
                borderRadius: 14,
                alignItems: 'center',
                backgroundColor: colors.bgTertiary,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>
                Cerrar
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
