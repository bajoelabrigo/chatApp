import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { upload } from '../middleware/upload';
import { uploadFile } from '../controllers/uploadController';

const router = Router();

router.post('/', authMiddleware, upload.single('file'), uploadFile);

export default router;
