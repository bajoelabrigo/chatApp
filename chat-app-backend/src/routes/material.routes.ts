import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  listMaterials,
  getMaterialFeed,
  markViewed,
  downloadMaterial,
} from '../controllers/materialController';

const router = Router();

router.use(authMiddleware);
router.get('/', listMaterials);
router.get('/feed', getMaterialFeed);
router.post('/:id/viewed', markViewed);
router.post('/:id/download', downloadMaterial);

export default router;
