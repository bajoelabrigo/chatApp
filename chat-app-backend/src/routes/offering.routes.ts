import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  createOrderCheckout,
  captureOrderReturn,
  cancelReturn,
  createSubscriptionCheckout,
  subReturn,
  subCancel,
  getOfferingHistory,
  getMyOfferingStatus,
  handleWebhook,
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
router.post('/subscription', createSubscriptionCheckout);
router.get('/history', getOfferingHistory);
router.get('/status', getMyOfferingStatus);

export default router;
