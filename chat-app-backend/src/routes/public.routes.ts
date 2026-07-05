import { Router } from 'express';
import { getPublicUser, getPublicGroup, qrCode, linkPreview } from '../controllers/publicController';

// Rutas públicas (sin autenticación) para la página de invitación de la web,
// la generación de códigos QR y la vista previa de enlaces del chat.
const router = Router();

router.get('/qr', qrCode);
router.get('/link-preview', linkPreview);
router.get('/users/:id', getPublicUser);
router.get('/groups/:id', getPublicGroup);

export default router;
