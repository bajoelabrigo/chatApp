import { Router } from 'express';
import { getVersions, getBooks, getChapters, getVerses, searchVerses, downloadBible } from '../controllers/bibleController';
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
} from '../controllers/bibleUserDataController';
import {
  getPlans,
  getPlanDetail,
  getMyPlans,
  subscribePlan,
  updateMyPlan,
  togglePlanDay,
  unsubscribePlan,
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

// Planes de lectura (#2). El catálogo es público; el progreso requiere sesión.
// También antes de las rutas dinámicas (`/plans` no debe verse como un libro).
router.get('/me/plans', authMiddleware, getMyPlans);
router.post('/me/plans', authMiddleware, subscribePlan);
router.patch('/me/plans/:key', authMiddleware, updateMyPlan);
router.post('/me/plans/:key/toggle-day', authMiddleware, togglePlanDay);
router.delete('/me/plans/:key', authMiddleware, unsubscribePlan);
router.get('/plans', getPlans);
router.get('/plans/:key', getPlanDetail);

// Static routes before dynamic ones
router.get('/versions', getVersions);
router.get('/books', getBooks);
router.get('/search', searchVerses);
router.get('/download', downloadBible);
router.get('/:book/chapters', getChapters);
router.get('/:book/:chapter', getVerses);

export default router;
