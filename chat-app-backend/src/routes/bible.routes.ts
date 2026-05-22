import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getVersions, getBooks, getChapters, getVerses, searchVerses, downloadBible } from '../controllers/bibleController';

const router = Router();

router.use(authMiddleware);

// Static routes before dynamic ones
router.get('/versions', getVersions);
router.get('/books', getBooks);
router.get('/search', searchVerses);
router.get('/download', downloadBible);
router.get('/:book/chapters', getChapters);
router.get('/:book/:chapter', getVerses);

export default router;
