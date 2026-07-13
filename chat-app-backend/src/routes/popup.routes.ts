import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  updatePopupConfig,
  getPopupStats,
  resetPopupStats,
  trackPopupEvent,
} from '../controllers/popupController';

// La lectura de la config va por `/public/popup-config` (sin auth). Aquí solo
// la edición (admin general) y el registro de eventos (usuario logueado).
const router = Router();

router.use(authMiddleware);
router.put('/config', updatePopupConfig);
router.get('/stats', getPopupStats);
router.post('/stats/reset', resetPopupStats);
router.post('/event', trackPopupEvent);

export default router;
