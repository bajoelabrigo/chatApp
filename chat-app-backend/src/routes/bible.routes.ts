import { Router } from 'express';
import { getVersions, getBooks, getChapters, getVerses, searchVerses, downloadBible } from '../controllers/bibleController';

const router = Router();

// La Biblia es contenido público (datos estáticos): accesible también para
// invitados de la web. Sin authMiddleware. Los controladores no usan req.userId.

// Static routes before dynamic ones
router.get('/versions', getVersions);
router.get('/books', getBooks);
router.get('/search', searchVerses);
router.get('/download', downloadBible);
router.get('/:book/chapters', getChapters);
router.get('/:book/:chapter', getVerses);

export default router;
