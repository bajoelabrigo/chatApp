import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  createReel,
  getReelsFeed,
  getStories,
  getUserReels,
  toggleLike,
  addView,
  getViewers,
  addComment,
  getComments,
  deleteReel,
  reportReel,
  shareReel,
  getYouTubeMetaEndpoint,
} from '../controllers/reelController';

const router = Router();

// Todos los endpoints de reels requieren sesión.
router.use(authMiddleware);

// Metadata de YouTube para el formulario (antes de las rutas dinámicas).
router.get('/youtube-meta', getYouTubeMetaEndpoint);

router.get('/', getReelsFeed);
router.get('/stories', getStories);
// Antes de `/:id/...` no hace falta (el prefijo `user/` no colisiona), pero se
// deja junto a las otras listas para que se lean seguidas.
router.get('/user/:userId', getUserReels);
router.post('/', createReel);
router.post('/:id/like', toggleLike);
router.post('/:id/view', addView);
router.get('/:id/views', getViewers);
router.post('/:id/comments', addComment);
router.get('/:id/comments', getComments);
router.post('/:id/share', shareReel);
router.post('/:id/report', reportReel);
router.delete('/:id', deleteReel);

export default router;
