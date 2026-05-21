import { Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { Conversation } from '../models/Conversation';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/authMiddleware';

export async function getGroupCallToken(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { conversationId } = req.body;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      isGroup: true,
    });
    if (!conversation) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }

    const user = await User.findById(userId).select('name');
    const roomName = `group_${conversationId}`;

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      { identity: userId, name: user?.name ?? 'Usuario' }
    );
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

    const token = await at.toJwt();
    res.json({ token, roomName, livekitUrl: process.env.LIVEKIT_URL });
  } catch {
    res.status(500).json({ error: 'Error generando token' });
  }
}
