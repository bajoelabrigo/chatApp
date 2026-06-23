import { Router } from 'express';
import { getPublicUser, getPublicGroup, qrCode } from '../controllers/publicController';

// Rutas públicas (sin autenticación) para la página de invitación de la web
// y la generación de códigos QR.
const router = Router();

router.get('/qr', qrCode);
router.get('/users/:id', getPublicUser);
router.get('/groups/:id', getPublicGroup);

export default router;
