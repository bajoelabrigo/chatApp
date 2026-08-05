import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  createOrderCheckout,
  createInlineOrderCheckout,
  captureInlineOrder,
  captureOrderReturn,
  cancelReturn,
  createSubscriptionCheckout,
  subReturn,
  subCancel,
  getOfferingHistory,
  getMyOfferingStatus,
  handleWebhook,
  createManualOffering,
  listAdminOfferings,
  deleteManualOffering,
  voidOffering,
} from '../controllers/offeringController';

const router = Router();

// PayPal return/cancel URLs — no auth, called by PayPal redirect
router.get('/capture', captureOrderReturn);
router.get('/cancel', cancelReturn);
router.get('/sub-return', subReturn);
router.get('/sub-cancel', subCancel);

// PayPal webhook — no auth, validated by signature
router.post('/webhook', handleWebhook);

router.use(authMiddleware);
router.post('/order', createOrderCheckout);
router.post('/order/inline', createInlineOrderCheckout);
router.post('/capture/inline', captureInlineOrder);
router.post('/subscription', createSubscriptionCheckout);
router.get('/history', getOfferingHistory);
router.get('/status', getMyOfferingStatus);

// Admin general (isGlobalAdmin dentro de cada handler): ofrendas manuales + reporte.
router.post('/admin/manual', createManualOffering);
router.get('/admin', listAdminOfferings);
router.post('/admin/:id/void', voidOffering);
// Legado: ya no borra, anula (ver el controlador).
router.delete('/admin/:id', deleteManualOffering);

export default router;
