import { Request, Response } from 'express';
import path from 'path';

type BibleData = Record<string, Record<string, Record<string, string>>>;

const ALLOWED_VERSIONS = ['RVR1960', 'RVA', 'KJV', 'WEB'] as const;
type VersionId = typeof ALLOWED_VERSIONS[number];

const VERSION_META: Record<VersionId, { name: string; short: string; lang: 'es' | 'en' }> = {
  RVR1960: { name: 'Reina Valera 1960',        short: 'RVR 1960', lang: 'es' },
  RVA:     { name: 'Reina Valera Actualizada',  short: 'RVA',      lang: 'es' },
  KJV:     { name: 'King James Version',         short: 'KJV',      lang: 'en' },
  WEB:     { name: 'World English Bible',         short: 'WEB',      lang: 'en' },
};

const lib = path.join(__dirname, '../lib/bible');

const bibles: Record<VersionId, BibleData> = {
  RVR1960: require(path.join(lib, 'RVR1960.json')),
  RVA:     require(path.join(lib, 'RVA.json')),
  KJV:     require(path.join(lib, 'KJV.json')),
  WEB:     require(path.join(lib, 'WEB.json')),
};

// Pre-build filtered book lists (removes metadata keys like 'lang')
const bookLists: Record<VersionId, string[]> = {} as any;
for (const id of ALLOWED_VERSIONS) {
  bookLists[id] = Object.keys(bibles[id]).filter((k) => typeof bibles[id][k] === 'object');
}

function getVersionData(req: Request): { data: BibleData; books: string[] } | null {
  const v = ((req.query.version as string) ?? 'RVR1960').toUpperCase() as VersionId;
  if (!ALLOWED_VERSIONS.includes(v)) return null;
  return { data: bibles[v], books: bookLists[v] };
}

export function getVersions(_req: Request, res: Response) {
  res.json(ALLOWED_VERSIONS.map((id) => ({ id, ...VERSION_META[id] })));
}

export function getBooks(req: Request, res: Response) {
  const vd = getVersionData(req);
  if (!vd) { res.status(400).json({ error: 'Versión no válida' }); return; }
  res.json(vd.books);
}

export function getChapters(req: Request, res: Response) {
  const vd = getVersionData(req);
  if (!vd) { res.status(400).json({ error: 'Versión no válida' }); return; }
  const book = decodeURIComponent(req.params.book);
  const bookData = vd.data[book];
  if (!bookData) { res.status(404).json({ error: 'Libro no encontrado' }); return; }
  res.json(Object.keys(bookData));
}

export function getVerses(req: Request, res: Response) {
  const vd = getVersionData(req);
  if (!vd) { res.status(400).json({ error: 'Versión no válida' }); return; }
  const book = decodeURIComponent(req.params.book);
  const { chapter } = req.params;
  const chapterData = vd.data[book]?.[chapter];
  if (!chapterData) { res.status(404).json({ error: 'Capítulo no encontrado' }); return; }
  res.json(Object.entries(chapterData).map(([verse, text]) => ({ verse, text: text.trim() })));
}

export function searchVerses(req: Request, res: Response) {
  const vd = getVersionData(req);
  if (!vd) { res.status(400).json({ error: 'Versión no válida' }); return; }
  const q = (req.query.q as string | undefined)?.trim().toLowerCase();
  if (!q || q.length < 3) {
    res.status(400).json({ error: 'La búsqueda debe tener al menos 3 caracteres' });
    return;
  }

  const results: { book: string; chapter: string; verse: string; text: string }[] = [];

  outer: for (const book of vd.books) {
    const bookData = vd.data[book];
    for (const chapter of Object.keys(bookData)) {
      const chapterData = bookData[chapter];
      for (const verse of Object.keys(chapterData)) {
        const text = chapterData[verse];
        if (text.toLowerCase().includes(q)) {
          results.push({ book, chapter, verse, text: text.trim() });
          if (results.length >= 100) break outer;
        }
      }
    }
  }

  res.json(results);
}

export function downloadBible(req: Request, res: Response) {
  const vd = getVersionData(req);
  if (!vd) { res.status(400).json({ error: 'Versión no válida' }); return; }
  const payload: BibleData = {};
  for (const key of vd.books) payload[key] = vd.data[key];
  res.json(payload);
}
