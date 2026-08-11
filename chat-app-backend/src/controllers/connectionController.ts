import { Response } from 'express';
import { User } from '../models/User';
import { ConnectionRequest } from '../models/ConnectionRequest';
import { AuthRequest } from '../middleware/authMiddleware';

function idStr(v: any): string {
  return v?.toString?.() ?? String(v);
}

// POST /connections/request/:userId
export async function sendConnectionRequest(req: AuthRequest, res: Response): Promise<void> {
  try {
    const senderId = req.userId!;
    const recipientId = req.params.userId;

    if (senderId === recipientId) {
      res.status(400).json({ error: 'No puedes enviarte una solicitud a ti mismo' });
      return;
    }

    const [sender, recipient] = await Promise.all([
      User.findById(senderId).select('blockedUsers connections'),
      User.findById(recipientId).select('blockedUsers'),
    ]);
    if (!sender || !recipient) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }

    const blocked =
      (sender.blockedUsers ?? []).some((id) => idStr(id) === recipientId) ||
      (recipient.blockedUsers ?? []).some((id) => idStr(id) === senderId);
    if (blocked) {
      res.status(403).json({ error: 'No puedes conectar con este usuario' });
      return;
    }

    if ((sender.connections ?? []).some((id) => idStr(id) === recipientId)) {
      res.status(400).json({ error: 'Ya estás conectado con este usuario' });
      return;
    }

    const existing = await ConnectionRequest.findOne({ sender: senderId, recipient: recipientId, status: 'pending' });
    if (existing) {
      res.status(400).json({ error: 'Ya existe una solicitud pendiente' });
      return;
    }

    const request = await ConnectionRequest.create({ sender: senderId, recipient: recipientId });
    res.status(201).json({ message: 'Solicitud enviada', requestId: request._id });
  } catch (err) {
    console.error('sendConnectionRequest:', err);
    res.status(500).json({ error: 'Error enviando la solicitud' });
  }
}

// PUT /connections/accept/:requestId
export async function acceptConnectionRequest(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const request = await ConnectionRequest.findById(req.params.requestId);
    if (!request) { res.status(404).json({ error: 'Solicitud no encontrada' }); return; }
    if (request.recipient.toString() !== userId) {
      res.status(403).json({ error: 'No tienes permiso sobre esta solicitud' });
      return;
    }
    if (request.status !== 'pending') {
      res.status(400).json({ error: 'La solicitud ya no está pendiente' });
      return;
    }

    request.status = 'accepted';
    await request.save();

    const senderId = request.sender.toString();
    await Promise.all([
      User.findByIdAndUpdate(senderId, { $addToSet: { connections: userId } }),
      User.findByIdAndUpdate(userId, { $addToSet: { connections: senderId } }),
      // Al conectar se limpia cualquier follow previo entre ambos (con el id
      // correcto del remitente — la web tiene un bug de copy-paste aquí que usa
      // el id de la SOLICITUD en vez del emisor; se corrige en este puerto).
      User.findByIdAndUpdate(userId, { $pull: { followers: senderId, following: senderId } }),
      User.findByIdAndUpdate(senderId, { $pull: { followers: userId, following: userId } }),
    ]);

    res.json({ message: 'Conexión aceptada' });
  } catch (err) {
    console.error('acceptConnectionRequest:', err);
    res.status(500).json({ error: 'Error aceptando la solicitud' });
  }
}

// PUT /connections/reject/:requestId
export async function rejectConnectionRequest(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const request = await ConnectionRequest.findById(req.params.requestId);
    if (!request) { res.status(404).json({ error: 'Solicitud no encontrada' }); return; }
    if (request.recipient.toString() !== userId) {
      res.status(403).json({ error: 'No tienes permiso sobre esta solicitud' });
      return;
    }
    if (request.status !== 'pending') {
      res.status(400).json({ error: 'La solicitud ya no está pendiente' });
      return;
    }
    request.status = 'rejected';
    await request.save();
    res.json({ message: 'Solicitud rechazada' });
  } catch (err) {
    console.error('rejectConnectionRequest:', err);
    res.status(500).json({ error: 'Error rechazando la solicitud' });
  }
}

// DELETE /connections/request/:requestId — cancelar (solo el remitente, mientras esté pendiente).
export async function cancelConnectionRequest(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const request = await ConnectionRequest.findById(req.params.requestId);
    if (!request) { res.status(404).json({ error: 'Solicitud no encontrada' }); return; }
    if (request.sender.toString() !== userId) {
      res.status(403).json({ error: 'No tienes permiso sobre esta solicitud' });
      return;
    }
    if (request.status !== 'pending') {
      res.status(400).json({ error: 'La solicitud ya no está pendiente' });
      return;
    }
    await request.deleteOne();
    res.json({ message: 'Solicitud cancelada' });
  } catch (err) {
    console.error('cancelConnectionRequest:', err);
    res.status(500).json({ error: 'Error cancelando la solicitud' });
  }
}

// GET /connections/request — solicitudes pendientes recibidas.
export async function getConnectionRequests(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const requests = await ConnectionRequest.find({ recipient: userId, status: 'pending' })
      .populate('sender', 'name avatar bio')
      .sort({ createdAt: -1 })
      .lean();
    res.json(requests);
  } catch (err) {
    console.error('getConnectionRequests:', err);
    res.status(500).json({ error: 'Error obteniendo solicitudes' });
  }
}

// GET /connections — mis conexiones (mutuas).
export async function getUserConnections(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const me = await User.findById(userId).select('connections blockedUsers').lean();
    if (!me) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }

    const blockedByMe = new Set((me.blockedUsers ?? []).map((id: any) => id.toString()));
    const connectionIds = (me.connections ?? []).map((id: any) => id.toString()).filter((id) => !blockedByMe.has(id));
    if (!connectionIds.length) { res.json([]); return; }

    const users = await User.find({ _id: { $in: connectionIds }, blockedUsers: { $ne: userId } })
      .select('name avatar bio')
      .lean();

    // Preservar el orden de `connections` (más reciente primero, como la web).
    const order = new Map(connectionIds.map((id, i) => [id, i]));
    users.sort((a: any, b: any) => (order.get(a._id.toString()) ?? 0) - (order.get(b._id.toString()) ?? 0));

    res.json(users);
  } catch (err) {
    console.error('getUserConnections:', err);
    res.status(500).json({ error: 'Error obteniendo conexiones' });
  }
}

// DELETE /connections/:userId — deshacer una conexión.
export async function removeConnection(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const targetId = req.params.userId;
    await Promise.all([
      User.findByIdAndUpdate(userId, { $pull: { connections: targetId } }),
      User.findByIdAndUpdate(targetId, { $pull: { connections: userId } }),
    ]);
    res.json({ message: 'Conexión eliminada' });
  } catch (err) {
    console.error('removeConnection:', err);
    res.status(500).json({ error: 'Error eliminando la conexión' });
  }
}

// GET /connections/status/:userId — self|connected|pending|received|not_connected
export async function getConnectionStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const targetId = req.params.userId;

    if (userId === targetId) { res.json({ status: 'self' }); return; }

    const me = await User.findById(userId).select('connections').lean();
    if ((me?.connections ?? []).some((id: any) => id.toString() === targetId)) {
      res.json({ status: 'connected' });
      return;
    }

    const pending = await ConnectionRequest.findOne({
      status: 'pending',
      $or: [
        { sender: userId, recipient: targetId },
        { sender: targetId, recipient: userId },
      ],
    });
    if (pending) {
      res.json({
        status: pending.sender.toString() === userId ? 'pending' : 'received',
        requestId: pending._id,
      });
      return;
    }

    res.json({ status: 'not_connected' });
  } catch (err) {
    console.error('getConnectionStatus:', err);
    res.status(500).json({ error: 'Error obteniendo el estado' });
  }
}
