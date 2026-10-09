// Elegir la MEJOR voz del teléfono para leer la Biblia en voz alta.
//
// expo-speech, sin `voice`, usa la voz por defecto del idioma, que casi siempre
// es la más básica (la "robótica" de la que se quejaron los usuarios). El
// teléfono suele traer otras mejores, solo hay que pedirlas por su identificador:
//
//   iOS      com.apple.voice.premium.es-ES.Marisol    ← la mejor (descargable)
//            com.apple.voice.enhanced.es-MX.Paulina   ← muy buena
//            com.apple.voice.compact.es-ES.Monica     ← la de serie, robótica
//            com.apple.eloquence.es-ES.Reed           ← sintetizador antiguo, peor aún
//   Android  es-us-x-esd-local / es-us-x-esd-network  ← voces de Google TTS
//            es-ES-language                           ← la de por defecto
//
// No hay un campo fiable que diga "esta suena natural": `quality` solo distingue
// Default/Enhanced y en Android casi todas salen Enhanced. Por eso se puntúa por
// el identificador. La web tiene su propia versión (`holy_app/frontend/src/lib/
// voiceRank.js`): las voces del navegador se llaman de otra forma, así que NO es
// un espejo línea a línea — solo la misma idea.

export interface NativeVoice {
  identifier: string;
  name: string;
  quality: string; // 'Default' | 'Enhanced'
  language: string;
}

// es_ES / es-es → es-ES
export const normLang = (l: string) => {
  const [base, region] = (l || '').replace('_', '-').split('-');
  return region ? `${base.toLowerCase()}-${region.toUpperCase()}` : (base || '').toLowerCase();
};

// Región del teléfono ("PE" en es-PE): a igualdad de calidad, mejor el acento local.
let deviceRegion: string | null | undefined;
function getDeviceRegion(): string | null {
  if (deviceRegion !== undefined) return deviceRegion;
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale || '';
    deviceRegion = normLang(loc).split('-')[1] ?? null;
  } catch {
    deviceRegion = null;
  }
  return deviceRegion;
}

// Locale por defecto para expo-speech cuando no hay voz elegida.
export function localeFor(lang: string) {
  const region = getDeviceRegion();
  if (lang === 'en') return 'en-US';
  if (lang === 'es') return region ? `es-${region}` : 'es-ES';
  return lang;
}

export const isNetworkVoice = (v: NativeVoice) => /-network$/i.test(v.identifier);

export function voiceScore(v: NativeVoice): number {
  const id = v.identifier.toLowerCase();
  let s = 0;
  if (id.includes('premium')) s += 60;
  else if (id.includes('enhanced')) s += 40;
  if (v.quality === 'Enhanced') s += 15;
  if (id.includes('compact')) s -= 20;
  // Sintetizadores antiguos y voces "de broma" de iOS: siempre al final.
  if (id.includes('eloquence') || id.includes('speech.synthesis.voice')) s -= 80;
  // Android: la "-network" puede sonar algo mejor, pero pide datos en CADA
  // versículo (pausas entre uno y otro, y sin conexión falla). Se prefiere la
  // local; la de red se puede elegir a mano.
  if (id.endsWith('-local')) s += 8;
  if (id.endsWith('-network')) s += 2;
  const region = getDeviceRegion();
  if (region && normLang(v.language).endsWith(`-${region}`)) s += 10;
  return s;
}

// Voces de un idioma ('es', 'en', …), de mejor a peor.
export function voicesFor(all: NativeVoice[], lang: string): NativeVoice[] {
  return all
    .filter((v) => normLang(v.language).split('-')[0] === lang)
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.identifier.localeCompare(b.identifier));
}

const REGIONS: Record<string, string> = {
  ES: 'España', MX: 'México', US: 'Estados Unidos', AR: 'Argentina', CO: 'Colombia',
  CL: 'Chile', PE: 'Perú', VE: 'Venezuela', '419': 'Latinoamérica', GB: 'Reino Unido',
  AU: 'Australia', IN: 'India', CA: 'Canadá', IE: 'Irlanda', ZA: 'Sudáfrica',
  BR: 'Brasil', PT: 'Portugal', FR: 'Francia', DE: 'Alemania',
};

// Nombre legible. En Android el "nombre" es el identificador (es-us-x-esd-local),
// que no le dice nada a nadie: se numera dentro de su región.
export function voiceLabel(v: NativeVoice, list: NativeVoice[]) {
  const region = normLang(v.language).split('-')[1];
  const where = region ? REGIONS[region] ?? region : '';
  const id = v.identifier.toLowerCase();
  const tags: string[] = [];
  if (id.includes('premium')) tags.push('Premium');
  else if (id.includes('enhanced')) tags.push('Mejorada');
  if (isNetworkVoice(v)) tags.push('Requiere internet');

  const looksLikeId = v.name === v.identifier || /^[a-z]{2}[-_]/i.test(v.name);
  let title = v.name;
  if (looksLikeId) {
    const sameRegion = list.filter((o) => normLang(o.language) === normLang(v.language));
    title = `Voz ${sameRegion.indexOf(v) + 1}`;
  }
  return { title, detail: [where, ...tags].filter(Boolean).join(' · ') };
}
