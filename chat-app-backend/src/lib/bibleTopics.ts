// Temas: pasajes para un momento concreto (una boda, un cumpleaños, una visita,
// un duelo, un ataque de ansiedad…).
//
// Nace de lo que la gente pide de verdad: "¿qué versículo leo en un bautizo?".
// La búsqueda por palabra no sirve para eso — quien busca "boda" no encuentra
// Eclesiastés 4:12, porque la palabra no aparece.
//
// Las referencias se guardan por ÍNDICE DE LIBRO (0–65, orden canónico), NO por
// nombre, igual que los planes de lectura y las referencias cruzadas: así el
// catálogo es agnóstico de versión y sirve para las 7 (español e inglés). El
// texto lo resuelve el controlador en la versión que pida el cliente.
//
// Un pasaje es [libro, capítulo, versículo] o [libro, capítulo, desde, hasta].
// Los rangos se devuelven versículo a versículo, para que cada uno conserve sus
// acciones (favorito, resaltado, nota, memorizar…).

export type TopicRef = [number, number, number] | [number, number, number, number];

export interface Topic {
  key: string;
  title: string;
  description: string;
  category: string;
  emoji: string;
  refs: TopicRef[];
}

// Las categorías ordenan la pestaña. "Ocasiones" va primero a propósito: es el
// caso que motivó la función (buscar un texto para un momento concreto).
export const TOPIC_CATEGORIES = ['Ocasiones', 'Cuando necesitas', 'Fe y vida'] as const;

export const TOPICS: Topic[] = [
  // ── Ocasiones ─────────────────────────────────────────────
  {
    key: 'cumpleanos',
    title: 'Cumpleaños',
    description: 'Para bendecir y dar gracias por un año más de vida.',
    category: 'Ocasiones',
    emoji: '🎂',
    refs: [
      [3, 6, 24, 26],   // Números 6:24-26 — la bendición sacerdotal
      [18, 90, 12],     // Salmos 90:12
      [18, 20, 4],      // Salmos 20:4
      [18, 118, 24],    // Salmos 118:24
      [23, 29, 11],     // Jeremías 29:11
      [24, 3, 22, 23],  // Lamentaciones 3:22-23
      [19, 9, 11],      // Proverbios 9:11
    ],
  },
  {
    key: 'matrimonio',
    title: 'Matrimonio y bodas',
    description: 'Para una boda, un aniversario o al orar por una pareja.',
    category: 'Ocasiones',
    emoji: '💍',
    refs: [
      [0, 2, 24],       // Génesis 2:24
      [20, 4, 9, 12],   // Eclesiastés 4:9-12 — el cordón de tres dobleces
      [45, 13, 4, 7],   // 1 Corintios 13:4-7
      [48, 5, 25],      // Efesios 5:25
      [50, 3, 14],      // Colosenses 3:14
      [40, 10, 9],      // Marcos 10:9
      [7, 1, 16, 17],   // Rut 1:16-17
      [21, 8, 6, 7],    // Cantares 8:6-7
    ],
  },
  {
    key: 'visitas',
    title: 'Visitas y hospitalidad',
    description: 'Al recibir a alguien en casa o visitar a un hermano.',
    category: 'Ocasiones',
    emoji: '🏡',
    refs: [
      [57, 13, 2],      // Hebreos 13:2 — hospedar ángeles sin saberlo
      [44, 12, 13],     // Romanos 12:13
      [59, 4, 9],       // 1 Pedro 4:9
      [41, 10, 38, 42], // Lucas 10:38-42 — Marta y María
      [0, 18, 1, 5],    // Génesis 18:1-5 — Abraham y los tres visitantes
      [43, 2, 46, 47],  // Hechos 2:46-47
    ],
  },
  {
    key: 'nacimiento',
    title: 'Nacimiento de un hijo',
    description: 'Para dar gracias por un bebé y presentarlo al Señor.',
    category: 'Ocasiones',
    emoji: '👶',
    refs: [
      [18, 127, 3, 5],   // Salmos 127:3-5
      [18, 139, 13, 16], // Salmos 139:13-16
      [8, 1, 27],        // 1 Samuel 1:27
      [22, 44, 3],       // Isaías 44:3
      [40, 10, 14, 16],  // Marcos 10:14-16
      [19, 22, 6],       // Proverbios 22:6
    ],
  },
  {
    key: 'bautismo',
    title: 'Bautismo',
    description: 'Pasajes para una ceremonia de bautismo.',
    category: 'Ocasiones',
    emoji: '💧',
    refs: [
      [39, 28, 19, 20],  // Mateo 28:19-20 — la gran comisión
      [43, 2, 38],       // Hechos 2:38
      [44, 6, 3, 4],     // Romanos 6:3-4
      [47, 3, 27],       // Gálatas 3:27
      [59, 3, 21],       // 1 Pedro 3:21
      [40, 1, 9, 11],    // Marcos 1:9-11 — el bautismo de Jesús
    ],
  },
  {
    key: 'graduacion',
    title: 'Graduación y nuevas etapas',
    description: 'Al empezar algo nuevo: estudios, trabajo, una mudanza.',
    category: 'Ocasiones',
    emoji: '🎓',
    refs: [
      [23, 29, 11],     // Jeremías 29:11
      [5, 1, 9],        // Josué 1:9
      [19, 3, 5, 6],    // Proverbios 3:5-6
      [49, 4, 13],      // Filipenses 4:13
      [22, 40, 31],     // Isaías 40:31
      [18, 32, 8],      // Salmos 32:8
    ],
  },
  {
    key: 'casa-nueva',
    title: 'Casa nueva',
    description: 'Para dedicar un hogar.',
    category: 'Ocasiones',
    emoji: '🔑',
    refs: [
      [5, 24, 15],      // Josué 24:15 — "yo y mi casa serviremos al Señor"
      [18, 127, 1],     // Salmos 127:1
      [19, 24, 3, 4],   // Proverbios 24:3-4
      [43, 16, 31],     // Hechos 16:31
      [4, 6, 6, 9],     // Deuteronomio 6:6-9
    ],
  },
  {
    key: 'viaje',
    title: 'Viaje',
    description: 'Para encomendar un camino y pedir protección.',
    category: 'Ocasiones',
    emoji: '✈️',
    refs: [
      [18, 121, 7, 8],  // Salmos 121:7-8
      [1, 33, 14],      // Éxodo 33:14
      [18, 91, 11],     // Salmos 91:11
      [22, 43, 2],      // Isaías 43:2
      [19, 3, 5, 6],    // Proverbios 3:5-6
    ],
  },
  {
    key: 'ano-nuevo',
    title: 'Año nuevo',
    description: 'Para empezar de nuevo y renovar la esperanza.',
    category: 'Ocasiones',
    emoji: '🎉',
    refs: [
      [24, 3, 22, 23],  // Lamentaciones 3:22-23 — nuevas cada mañana
      [22, 43, 18, 19], // Isaías 43:18-19
      [46, 5, 17],      // 2 Corintios 5:17
      [49, 3, 13, 14],  // Filipenses 3:13-14
      [18, 65, 11],     // Salmos 65:11
      [19, 16, 3],      // Proverbios 16:3
    ],
  },
  {
    key: 'duelo',
    title: 'Duelo y consuelo',
    description: 'Ante la pérdida de un ser querido. También para un funeral.',
    category: 'Ocasiones',
    emoji: '🕊️',
    refs: [
      [18, 23, 1, 6],    // Salmos 23 completo
      [42, 11, 25, 26],  // Juan 11:25-26
      [65, 21, 4],       // Apocalipsis 21:4
      [51, 4, 13, 14],   // 1 Tesalonicenses 4:13-14
      [46, 1, 3, 4],     // 2 Corintios 1:3-4
      [39, 5, 4],        // Mateo 5:4
      [18, 34, 18],      // Salmos 34:18
    ],
  },

  // ── Cuando necesitas ──────────────────────────────────────
  {
    key: 'ansiedad',
    title: 'Ansiedad y preocupación',
    description: 'Cuando la mente no para.',
    category: 'Cuando necesitas',
    emoji: '🌊',
    refs: [
      [49, 4, 6, 7],     // Filipenses 4:6-7
      [59, 5, 7],        // 1 Pedro 5:7
      [39, 6, 25, 34],   // Mateo 6:25-34
      [18, 55, 22],      // Salmos 55:22
      [22, 41, 10],      // Isaías 41:10
      [42, 14, 27],      // Juan 14:27
    ],
  },
  {
    key: 'miedo',
    title: 'Miedo',
    description: 'Cuando el temor aprieta.',
    category: 'Cuando necesitas',
    emoji: '🛡️',
    refs: [
      [22, 41, 10],      // Isaías 41:10
      [5, 1, 9],         // Josué 1:9
      [18, 27, 1],       // Salmos 27:1
      [54, 1, 7],        // 2 Timoteo 1:7
      [18, 56, 3, 4],    // Salmos 56:3-4
      [4, 31, 6],        // Deuteronomio 31:6
    ],
  },
  {
    key: 'tristeza',
    title: 'Tristeza y desánimo',
    description: 'Cuando el ánimo se hunde.',
    category: 'Cuando necesitas',
    emoji: '🌧️',
    refs: [
      [18, 34, 17, 18],  // Salmos 34:17-18
      [18, 42, 11],      // Salmos 42:11
      [39, 11, 28, 30],  // Mateo 11:28-30
      [22, 61, 3],       // Isaías 61:3
      [18, 30, 5],       // Salmos 30:5
      [42, 16, 22],      // Juan 16:22
    ],
  },
  {
    key: 'enfermedad',
    title: 'Enfermedad y sanidad',
    description: 'Al orar por un enfermo.',
    category: 'Cuando necesitas',
    emoji: '🩺',
    refs: [
      [58, 5, 14, 15],   // Santiago 5:14-15
      [18, 103, 2, 3],   // Salmos 103:2-3
      [22, 53, 5],       // Isaías 53:5
      [23, 30, 17],      // Jeremías 30:17
      [1, 15, 26],       // Éxodo 15:26
      [18, 41, 3],       // Salmos 41:3
    ],
  },
  {
    key: 'soledad',
    title: 'Soledad',
    description: 'Cuando sientes que estás solo.',
    category: 'Cuando necesitas',
    emoji: '🫂',
    refs: [
      [4, 31, 8],        // Deuteronomio 31:8
      [18, 68, 6],       // Salmos 68:6
      [57, 13, 5],       // Hebreos 13:5
      [39, 28, 20],      // Mateo 28:20
      [22, 41, 10],      // Isaías 41:10
    ],
  },
  {
    key: 'cansancio',
    title: 'Cansancio y fuerzas',
    description: 'Cuando ya no puedes más.',
    category: 'Cuando necesitas',
    emoji: '🔋',
    refs: [
      [22, 40, 29, 31],  // Isaías 40:29-31
      [39, 11, 28],      // Mateo 11:28
      [18, 121, 1, 2],   // Salmos 121:1-2
      [46, 12, 9],       // 2 Corintios 12:9
      [47, 6, 9],        // Gálatas 6:9
    ],
  },
  {
    key: 'perdon',
    title: 'Perdón',
    description: 'Para pedir perdón y para perdonar.',
    category: 'Cuando necesitas',
    emoji: '🤲',
    refs: [
      [61, 1, 9],        // 1 Juan 1:9
      [48, 4, 32],       // Efesios 4:32
      [39, 6, 14, 15],   // Mateo 6:14-15
      [50, 3, 13],       // Colosenses 3:13
      [18, 103, 12],     // Salmos 103:12
      [22, 1, 18],       // Isaías 1:18
    ],
  },
  {
    key: 'provision',
    title: 'Provisión y trabajo',
    description: 'Cuando falta el dinero o el trabajo aprieta.',
    category: 'Cuando necesitas',
    emoji: '🌾',
    refs: [
      [49, 4, 19],       // Filipenses 4:19
      [39, 6, 31, 33],   // Mateo 6:31-33
      [18, 37, 25],      // Salmos 37:25
      [19, 3, 9, 10],    // Proverbios 3:9-10
      [38, 3, 10],       // Malaquías 3:10
      [50, 3, 23, 24],   // Colosenses 3:23-24
    ],
  },
  {
    key: 'decisiones',
    title: 'Decisiones y dirección',
    description: 'Cuando no sabes qué camino tomar.',
    category: 'Cuando necesitas',
    emoji: '🧭',
    refs: [
      [19, 3, 5, 6],     // Proverbios 3:5-6
      [58, 1, 5],        // Santiago 1:5
      [18, 32, 8],       // Salmos 32:8
      [22, 30, 21],      // Isaías 30:21
      [18, 119, 105],    // Salmos 119:105
      [19, 16, 9],       // Proverbios 16:9
    ],
  },

  // ── Fe y vida ─────────────────────────────────────────────
  {
    key: 'salvacion',
    title: 'Salvación',
    description: 'El evangelio en pocos versículos. Para compartir la fe.',
    category: 'Fe y vida',
    emoji: '✝️',
    refs: [
      [42, 3, 16],       // Juan 3:16
      [44, 3, 23],       // Romanos 3:23
      [44, 6, 23],       // Romanos 6:23
      [44, 10, 9, 10],   // Romanos 10:9-10
      [48, 2, 8, 9],     // Efesios 2:8-9
      [42, 14, 6],       // Juan 14:6
      [43, 4, 12],       // Hechos 4:12
    ],
  },
  {
    key: 'amor-de-dios',
    title: 'El amor de Dios',
    description: 'Cuando necesitas recordar que eres amado.',
    category: 'Fe y vida',
    emoji: '❤️',
    refs: [
      [42, 3, 16],       // Juan 3:16
      [44, 8, 38, 39],   // Romanos 8:38-39
      [61, 4, 9, 10],    // 1 Juan 4:9-10
      [23, 31, 3],       // Jeremías 31:3
      [18, 136, 1],      // Salmos 136:1
      [48, 3, 17, 19],   // Efesios 3:17-19
    ],
  },
  {
    key: 'oracion',
    title: 'Oración',
    description: 'Cómo orar y por qué.',
    category: 'Fe y vida',
    emoji: '🙏',
    refs: [
      [39, 6, 9, 13],    // Mateo 6:9-13 — el Padre Nuestro
      [49, 4, 6],        // Filipenses 4:6
      [61, 5, 14, 15],   // 1 Juan 5:14-15
      [58, 5, 16],       // Santiago 5:16
      [23, 33, 3],       // Jeremías 33:3
      [41, 11, 9, 10],   // Lucas 11:9-10
    ],
  },
  {
    key: 'fe',
    title: 'Fe',
    description: 'Cuando la fe flaquea.',
    category: 'Fe y vida',
    emoji: '⛰️',
    refs: [
      [57, 11, 1],       // Hebreos 11:1
      [57, 11, 6],       // Hebreos 11:6
      [40, 11, 22, 24],  // Marcos 11:22-24
      [44, 10, 17],      // Romanos 10:17
      [46, 5, 7],        // 2 Corintios 5:7
      [39, 17, 20],      // Mateo 17:20
    ],
  },
  {
    key: 'gratitud',
    title: 'Gratitud',
    description: 'Para dar gracias en cualquier circunstancia.',
    category: 'Fe y vida',
    emoji: '🙌',
    refs: [
      [51, 5, 16, 18],   // 1 Tesalonicenses 5:16-18
      [18, 100, 4, 5],   // Salmos 100:4-5
      [50, 3, 15, 17],   // Colosenses 3:15-17
      [18, 107, 1],      // Salmos 107:1
      [48, 5, 20],       // Efesios 5:20
    ],
  },
  {
    key: 'amistad',
    title: 'Amistad',
    description: 'Sobre los amigos de verdad.',
    category: 'Fe y vida',
    emoji: '🤝',
    refs: [
      [19, 17, 17],      // Proverbios 17:17
      [19, 18, 24],      // Proverbios 18:24
      [19, 27, 17],      // Proverbios 27:17
      [20, 4, 9, 10],    // Eclesiastés 4:9-10
      [42, 15, 13],      // Juan 15:13
    ],
  },
  {
    key: 'familia',
    title: 'Familia',
    description: 'Para el hogar, los padres y los hijos.',
    category: 'Fe y vida',
    emoji: '👨‍👩‍👧',
    refs: [
      [5, 24, 15],       // Josué 24:15
      [48, 6, 1, 4],     // Efesios 6:1-4
      [18, 133, 1],      // Salmos 133:1
      [19, 22, 6],       // Proverbios 22:6
      [4, 6, 6, 7],      // Deuteronomio 6:6-7
      [53, 5, 8],        // 1 Timoteo 5:8
    ],
  },
];

export function getTopic(key: string): Topic | undefined {
  return TOPICS.find((t) => t.key === key);
}
