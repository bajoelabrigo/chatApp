import { Router } from 'express';
import { getPublicUser, getPublicGroup, qrCode, linkPreview, searchPhotos, proxyPhoto } from '../controllers/publicController';
import { getPublicPopupConfig } from '../controllers/popupController';

// Rutas públicas (sin autenticación) para la página de invitación de la web,
// la generación de códigos QR y la vista previa de enlaces del chat.
const router = Router();

router.get('/qr', qrCode);
router.get('/link-preview', linkPreview);
router.get('/photos', searchPhotos);
router.get('/photo', proxyPhoto);
router.get('/popup-config', getPublicPopupConfig);
router.get('/users/:id', getPublicUser);
router.get('/groups/:id', getPublicGroup);

export default router;
