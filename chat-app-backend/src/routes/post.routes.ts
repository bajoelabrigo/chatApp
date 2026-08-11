import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getFeedPosts,
  getSavedPosts,
  getPostsByUser,
  getPostById,
  getPostEngagement,
  createPost,
  updatePost,
  deletePost,
  likePost,
  reactToPost,
  toggleSavePost,
  markPostAsNotInterested,
  recordShare,
  addComment,
  editComment,
  deleteComment,
  addReply,
  deleteReply,
  reactToComment,
  reactToReply,
} from '../controllers/postController';

const router = Router();

router.use(authMiddleware);

router.get('/', getFeedPosts);
router.get('/saved', getSavedPosts);
router.get('/user/:userId', getPostsByUser);
router.get('/:id', getPostById);
router.get('/:id/engagement', getPostEngagement);

router.post('/', createPost);
router.put('/:id', updatePost);
router.delete('/:id', deletePost);

router.post('/:id/like', likePost);
router.patch('/:id/react', reactToPost);
router.post('/:id/save', toggleSavePost);
router.post('/:id/hide', markPostAsNotInterested);
router.post('/:id/share/:network', recordShare);

router.post('/:id/comments', addComment);
router.patch('/:id/comments/:commentId', editComment);
router.delete('/:id/comments/:commentId', deleteComment);
router.post('/:id/comments/:commentId/replies', addReply);
router.delete('/:id/comments/:commentId/replies/:replyId', deleteReply);
router.patch('/:id/comments/:commentId/react', reactToComment);
router.patch('/:id/comments/:commentId/replies/:replyId/react', reactToReply);

export default router;
