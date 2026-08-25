import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  createReel,
  getReelsFeed,
  getStories,
  toggleLike,
  addView,
  getViewers,
  addComment,
  getComments,
  deleteReel,
  getYouTubeMetaEndpoint,
} from '../controllers/reelController';

const router = Router();

// Todos los endpoints de reels requieren sesión.
router.use(authMiddleware);

// Metadata de YouTube para el formulario (antes de las rutas dinámicas).
router.get('/youtube-meta', getYouTubeMetaEndpoint);

router.get('/', getReelsFeed);
router.get('/stories', getStories);
router.post('/', createReel);
router.post('/:id/like', toggleLike);
router.post('/:id/view', addView);
router.get('/:id/views', getViewers);
router.post('/:id/comments', addComment);
router.get('/:id/comments', getComments);
router.delete('/:id', deleteReel);

export default router;
