import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/authMiddleware';
import { upload } from '../middleware/upload';
import { uploadFile } from '../controllers/uploadController';

const router = Router();

function multerHandler(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Error de archivo: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message ?? 'Tipo de archivo no permitido' });
    }
    next();
  });
}

router.post('/', authMiddleware, multerHandler, uploadFile);

export default router;
