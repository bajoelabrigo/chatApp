import { Router } from 'express';
import {
  getVersions,
  getBooks,
  getChapters,
  getVerses,
  searchVerses,
  downloadBible,
  getDailyVerse,
  getChapterXrefCounts,
  getVerseXrefs,
  getTopics,
  getTopicDetail,
} from '../controllers/bibleController';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getMyBibleData,
  syncMyBibleData,
  addFavorite,
  removeFavorite,
  upsertHighlight,
  removeHighlight,
  upsertAnnotation,
  removeAnnotation,
  getMemorize,
  addMemorize,
  reviewMemorize,
  removeMemorize,
  getStreak,
  markReadToday,
} from '../controllers/bibleUserDataController';
import {
  getPlans,
  getPlanDetail,
  getMyPlans,
  subscribePlan,
  updateMyPlan,
  togglePlanDay,
  unsubscribePlan,
  getGroupPlans,
  getMyGroupPlans,
} from '../controllers/readingPlanController';

const router = Router();

// La Biblia es contenido público (datos estáticos): accesible también para
// invitados de la web. Sin authMiddleware. Los controladores no usan req.userId.

// Datos personales del usuario (favoritos/resaltados/notas) — REQUIEREN sesión.
// Van ANTES que las rutas dinámicas (`/:book/...`) para que "me" no se capture
// como si fuera un libro.
router.get('/me/data', authMiddleware, getMyBibleData);
router.post('/me/sync', authMiddleware, syncMyBibleData);
router.post('/me/favorites', authMiddleware, addFavorite);
router.delete('/me/favorites/:id', authMiddleware, removeFavorite);
router.put('/me/highlights', authMiddleware, upsertHighlight);
router.delete('/me/highlights/:id', authMiddleware, removeHighlight);
router.put('/me/annotations', authMiddleware, upsertAnnotation);
router.delete('/me/annotations/:id', authMiddleware, removeAnnotation);

// Memorizar versículos (repaso espaciado) y racha de lectura.
router.get('/me/memorize', authMiddleware, getMemorize);
router.post('/me/memorize', authMiddleware, addMemorize);
router.post('/me/memorize/:id/review', authMiddleware, reviewMemorize);
router.delete('/me/memorize/:id', authMiddleware, removeMemorize);
router.get('/me/streak', authMiddleware, getStreak);
router.post('/me/streak', authMiddleware, markReadToday);

// Planes de lectura (#2). El catálogo es público; el progreso requiere sesión.
// También antes de las rutas dinámicas (`/plans` no debe verse como un libro).
router.get('/me/plans', authMiddleware, getMyPlans);
// Planes que leen mis grupos (aunque no me haya unido). Antes de `/me/plans/:key`
// para que "group-plans" no se capture como una `:key`.
router.get('/me/group-plans', authMiddleware, getMyGroupPlans);
router.post('/me/plans', authMiddleware, subscribePlan);
router.patch('/me/plans/:key', authMiddleware, updateMyPlan);
router.post('/me/plans/:key/toggle-day', authMiddleware, togglePlanDay);
router.delete('/me/plans/:key', authMiddleware, unsubscribePlan);
router.get('/plans', getPlans);
router.get('/plans/:key', getPlanDetail);

// Planes que lee un GRUPO, con el progreso de cada miembro. Requiere ser miembro.
// También antes de las rutas dinámicas (`/groups` no es un libro).
router.get('/groups/:groupId/plans', authMiddleware, getGroupPlans);

// Static routes before dynamic ones
router.get('/versions', getVersions);
router.get('/daily', getDailyVerse); // versículo del día (#8), público
router.get('/books', getBooks);
router.get('/search', searchVerses);
router.get('/download', downloadBible);

// Referencias cruzadas. ANTES de `/:book/...` o Express tomaría "xrefs" por el
// nombre de un libro. Público, como el resto de la Biblia.
router.get('/xrefs/:book/:chapter/:verse', getVerseXrefs);
router.get('/xrefs/:book/:chapter', getChapterXrefCounts);

// Temas (pasajes para una ocasión). También antes de las rutas dinámicas.
router.get('/topics', getTopics);
router.get('/topics/:key', getTopicDetail);

router.get('/:book/chapters', getChapters);
router.get('/:book/:chapter', getVerses);

export default router;
