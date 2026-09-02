import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VERSION_META, langFlag, langLabel } from '../../constants/bible';
import type { BibleVersion } from '../../services/bibleService';

// Lista de versiones para elegir. La usan dos modales:
//  - el selector de versión (con estado de descarga por versión), y
//  - el de la vista paralela (#5), que solo elige la segunda versión.
//
// Si el backend aún no ha devuelto las versiones, se cae a VERSION_META para no
// enseñar una lista vacía.
export const versionList = (available: BibleVersion[]): BibleVersion[] =>
  available.length > 0
    ? available
    : Object.entries(VERSION_META).map(([id, m]) => ({
        id,
        name: m.name,
        short: m.short,
        lang: m.lang,
        remote: m.remote,
      }));

// ─── Chips de idioma: "Todos" + un chip por idioma con su recuento ────────────
// El usuario elige el idioma y solo se muestran las biblias de ese idioma.
export function LangFilterChips({
  list,
  value,
  onChange,
  colors,
}: {
  list: BibleVersion[];
  value: string;
  onChange: (lang: string) => void;
  colors: any;
}) {
  const langs = [...new Set(list.map((v) => v.lang).filter(Boolean))];
  const chip = (active: boolean) => ({
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: active ? colors.accent : colors.bgTertiary,
    borderWidth: 1,
    borderColor: active ? colors.accent : colors.border,
  });
  const chipText = (active: boolean) => ({
    color: active ? '#fff' : colors.textPrimary,
    fontSize: 13,
    fontWeight: '600' as const,
  });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, marginBottom: 6 }}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      <TouchableOpacity onPress={() => onChange('all')} style={chip(value === 'all')}>
        <Text style={chipText(value === 'all')}>Todos ({list.length})</Text>
      </TouchableOpacity>
      {langs.map((lang) => {
        const count = list.filter((v) => v.lang === lang).length;
        const active = value === lang;
        return (
          <TouchableOpacity key={lang} onPress={() => onChange(lang)} style={chip(active)}>
            <Text style={chipText(active)}>
              {langFlag(lang)} {langLabel(lang)} ({count})
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

interface Props {
  visible: boolean;
  versions: BibleVersion[];
  selectedVersion: string;
  downloadedVersions: Set<string>;
  downloadingVersion: string | null;
  downloadProgress: number;
  colors: any;
  bottomInset: number;
  onClose: () => void;
  onSelect: (version: string) => void;
  onDownload: (version: string) => void;
  onCancelDownload: () => void;
}

export function VersionPickerModal({
  visible,
  versions,
  selectedVersion,
  downloadedVersions,
  downloadingVersion,
  downloadProgress,
  colors,
  bottomInset,
  onClose,
  onSelect,
  onDownload,
  onCancelDownload,
}: Props) {
  const [langFilter, setLangFilter] = useState('all');
  useEffect(() => {
    if (visible) setLangFilter('all');
  }, [visible]);

  const list = versionList(versions);
  const filtered = langFilter === 'all' ? list : list.filter((v) => v.lang === langFilter);
  // Son 35 versiones: sin scroll propio la hoja crece por encima de la pantalla y
  // las de abajo quedan fuera, sin forma de alcanzarlas. Los chips de idioma y el
  // botón de cerrar se quedan FUERA del scroll para que sigan siempre a mano.
  const { height: screenH } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <View style={{
            backgroundColor: colors.bgSecondary,
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            paddingBottom: bottomInset + 16,
          }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 }} />

            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginVertical: 12 }}>
              Versión de la Biblia
            </Text>

            <LangFilterChips list={list} value={langFilter} onChange={setLangFilter} colors={colors} />

            <ScrollView style={{ maxHeight: screenH * 0.6 }} contentContainerStyle={{ paddingBottom: 4 }}>
            {filtered.map((v) => {
              const isActive = v.id === selectedVersion;
              const isDownloaded = downloadedVersions.has(v.id);
              const isDownloading = downloadingVersion === v.id;

              return (
                <TouchableOpacity
                  key={v.id}
                  onPress={() => onSelect(v.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 20, paddingVertical: 14,
                    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
                    backgroundColor: isActive ? colors.accent + '15' : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 22, marginRight: 12 }}>
                    {langFlag(v.lang)}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: isActive ? '700' : '500' }}>
                      {v.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
                      {v.short}{v.remote ? ' · ☁️ en línea' : ''}
                    </Text>
                  </View>

                  {isDownloaded ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: '#22c55e22' }}>
                      <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                      <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '600' }}>Descargada</Text>
                    </View>
                  ) : isDownloading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: colors.accent, fontSize: 12 }}>{Math.round(downloadProgress * 100)}%</Text>
                      <TouchableOpacity onPress={onCancelDownload}>
                        <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); onDownload(v.id); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border }}
                    >
                      <Ionicons name="download-outline" size={14} color={colors.accent} />
                      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>Descargar</Text>
                    </TouchableOpacity>
                  )}

                  {isActive && <Ionicons name="checkmark" size={18} color={colors.accent} style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              );
            })}
            </ScrollView>

            <TouchableOpacity
              onPress={onClose}
              style={{ marginHorizontal: 20, marginTop: 12, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Vista paralela (#5): elegir la segunda versión (o dejar de comparar) ───
interface CompareProps {
  visible: boolean;
  versions: BibleVersion[];
  selectedVersion: string;
  compareVersion: string | null;
  colors: any;
  bottomInset: number;
  onClose: () => void;
  onSelect: (version: string | null) => void;
}

export function ComparePickerModal({
  visible,
  versions,
  selectedVersion,
  compareVersion,
  colors,
  bottomInset,
  onClose,
  onSelect,
}: CompareProps) {
  const [langFilter, setLangFilter] = useState('all');
  useEffect(() => {
    if (visible) setLangFilter('all');
  }, [visible]);

  const list = versionList(versions).filter((v) => v.id !== selectedVersion);
  const filtered = langFilter === 'all' ? list : list.filter((v) => v.lang === langFilter);
  const { height: screenH } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <View style={{
            backgroundColor: colors.bgSecondary,
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            paddingBottom: bottomInset + 16,
          }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 }} />

            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginVertical: 12 }}>
              Comparar con…
            </Text>

            <LangFilterChips list={list} value={langFilter} onChange={setLangFilter} colors={colors} />

            {/* No tiene sentido comparar una versión consigo misma */}
            <ScrollView style={{ maxHeight: screenH * 0.6 }} contentContainerStyle={{ paddingBottom: 4 }}>
            {filtered.map((v) => {
              const isActive = v.id === compareVersion;
              return (
                <TouchableOpacity
                  key={v.id}
                  onPress={() => onSelect(v.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingHorizontal: 20, paddingVertical: 15,
                    backgroundColor: isActive ? colors.accent + '15' : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{langFlag(v.lang)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>{v.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {v.short}{v.remote ? ' · ☁️ en línea' : ''}
                    </Text>
                  </View>
                  {isActive && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                </TouchableOpacity>
              );
            })}
            </ScrollView>

            <TouchableOpacity
              onPress={() => onSelect(null)}
              style={{
                marginHorizontal: 20, marginTop: 10, paddingVertical: 14, borderRadius: 14,
                backgroundColor: colors.inputBg, alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>
                {compareVersion ? 'Dejar de comparar' : 'Cancelar'}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
