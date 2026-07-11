import { Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { Meeting, generateMeetingCode, roomNameFor } from '../models/Meeting';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/authMiddleware';
import { getIO } from '../socket/ioSingleton';
import { roomService, muteParticipantSource, TrackSource } from '../services/livekitService';

const TOKEN_TTL = '4h';

/** Carga la reunión abierta o responde 404. */
async function openMeeting(code: string, res: Response) {
  const meeting = await Meeting.findOne({ code, status: 'open' });
  if (!meeting) {
    res.status(404).json({ error: 'La reunión no existe o ya terminó' });
    return null;
  }
  return meeting;
}

/** Igual que openMeeting pero exige que quien pide sea el anfitrión. */
async function hostedMeeting(code: string, userId: string, res: Response) {
  const meeting = await openMeeting(code, res);
  if (!meeting) return null;
  if (meeting.host.toString() !== userId) {
    res.status(403).json({ error: 'Solo el anfitrión puede hacer esto' });
    return null;
  }
  return meeting;
}

export async function createMeeting(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { title, scheduledAt, lobbyEnabled } = req.body ?? {};

    // El índice único de `code` es la garantía real; el bucle solo evita que una
    // colisión (improbable) se convierta en un 500.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const meeting = await Meeting.create({
          code: generateMeetingCode(),
          title: (title as string)?.trim() || 'Reunión',
          host: userId,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
          lobbyEnabled: lobbyEnabled !== false,
        });
        res.status(201).json(meeting);
        return;
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
      }
    }
    res.status(500).json({ error: 'No se pudo generar un código libre' });
  } catch {
    res.status(500).json({ error: 'Error creando la reunión' });
  }
}

export async function listMyMeetings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const meetings = await Meeting.find({
      status: 'open',
      $or: [{ host: userId }, { admitted: userId }],
    })
      .populate('host', 'name avatar')
      .sort({ scheduledAt: 1, createdAt: -1 })
      .limit(50);
    res.json(meetings);
  } catch {
    res.status(500).json({ error: 'Error cargando las reuniones' });
  }
}

export async function getMeeting(req: AuthRequest, res: Response): Promise<void> {
  try {
    const meeting = await Meeting.findOne({ code: req.params.code }).populate(
      'host',
      'name avatar'
    );
    if (!meeting) {
      res.status(404).json({ error: 'La reunión no existe' });
      return;
    }
    res.json({
      code: meeting.code,
      title: meeting.title,
      host: meeting.host,
      status: meeting.status,
      lobbyEnabled: meeting.lobbyEnabled,
      scheduledAt: meeting.scheduledAt,
      isHost: (meeting.host as any)._id.toString() === req.userId,
    });
  } catch {
    res.status(500).json({ error: 'Error cargando la reunión' });
  }
}

export async function updateMeeting(req: AuthRequest, res: Response): Promise<void> {
  try {
    const meeting = await hostedMeeting(req.params.code, req.userId!, res);
    if (!meeting) return;

    const { title, scheduledAt, lobbyEnabled } = req.body ?? {};
    if (typeof title === 'string' && title.trim()) meeting.title = title.trim();
    if (scheduledAt !== undefined) {
      meeting.scheduledAt = scheduledAt ? new Date(scheduledAt) : undefined;
    }
    if (typeof lobbyEnabled === 'boolean') meeting.lobbyEnabled = lobbyEnabled;
    await meeting.save();
    res.json(meeting);
  } catch {
    res.status(500).json({ error: 'Error actualizando la reunión' });
  }
}

/**
 * Token de acceso a la sala. Si hay sala de espera y quien pide no es el
 * anfitrión ni fue admitido antes, no se emite token: se avisa al anfitrión por
 * socket y el cliente queda esperando `meeting:admitted`.
 */
export async function getMeetingToken(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const meeting = await openMeeting(req.params.code, res);
    if (!meeting) return;

    const isHost = meeting.host.toString() === userId;
    const admitted = meeting.admitted.some((id) => id.toString() === userId);

    if (!isHost && meeting.lobbyEnabled && !admitted) {
      const user = await User.findById(userId).select('name avatar');
      getIO()
        ?.to(`user:${meeting.host.toString()}`)
        .emit('meeting:knock', {
          code: meeting.code,
          userId,
          name: user?.name ?? 'Usuario',
          avatar: (user as any)?.avatar ?? null,
        });
      res.status(202).json({ waiting: true });
      return;
    }

    const user = await User.findById(userId).select('name avatar');
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      {
        identity: userId,
        name: user?.name ?? 'Usuario',
        metadata: JSON.stringify({ avatar: (user as any)?.avatar ?? null, isHost }),
        ttl: TOKEN_TTL,
      }
    );
    at.addGrant({
      roomJoin: true,
      room: roomNameFor(meeting.code),
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Necesario para levantar la mano: el cliente escribe sus propios atributos.
      canUpdateOwnMetadata: true,
      roomAdmin: isHost,
    });

    res.json({
      token: await at.toJwt(),
      livekitUrl: process.env.LIVEKIT_URL,
      roomName: roomNameFor(meeting.code),
      isHost,
      title: meeting.title,
    });
  } catch {
    res.status(500).json({ error: 'Error generando el token' });
  }
}

export async function admitParticipant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const meeting = await hostedMeeting(req.params.code, req.userId!, res);
    if (!meeting) return;

    const { userId, deny } = req.body ?? {};
    if (!userId) {
      res.status(400).json({ error: 'Falta userId' });
      return;
    }

    if (deny) {
      getIO()?.to(`user:${userId}`).emit('meeting:denied', { code: meeting.code });
      res.json({ ok: true, denied: true });
      return;
    }

    await Meeting.updateOne({ _id: meeting._id }, { $addToSet: { admitted: userId } });
    getIO()?.to(`user:${userId}`).emit('meeting:admitted', { code: meeting.code });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error admitiendo al participante' });
  }
}

export async function muteParticipant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const meeting = await hostedMeeting(req.params.code, req.userId!, res);
    if (!meeting) return;

    const { identity, source } = req.body ?? {};
    if (!identity) {
      res.status(400).json({ error: 'Falta identity' });
      return;
    }
    const muted = await muteParticipantSource(
      roomNameFor(meeting.code),
      identity,
      source === 'camera' ? TrackSource.CAMERA : TrackSource.MICROPHONE
    );
    res.json({ ok: true, muted });
  } catch {
    res.status(500).json({ error: 'No se pudo silenciar' });
  }
}

export async function removeParticipant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const meeting = await hostedMeeting(req.params.code, req.userId!, res);
    if (!meeting) return;

    const { identity } = req.body ?? {};
    if (!identity) {
      res.status(400).json({ error: 'Falta identity' });
      return;
    }
    // Sacarlo de `admitted` o volvería a entrar sin pasar por la sala de espera.
    await Meeting.updateOne({ _id: meeting._id }, { $pull: { admitted: identity } });
    await roomService().removeParticipant(roomNameFor(meeting.code), identity);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'No se pudo expulsar al participante' });
  }
}

export async function deleteMeeting(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    // No usamos hostedMeeting: borrar debe funcionar también sobre reuniones ya
    // terminadas (que hostedMeeting/openMeeting descartan por status).
    const meeting = await Meeting.findOne({ code: req.params.code });
    if (!meeting) {
      res.status(404).json({ error: 'La reunión no existe' });
      return;
    }
    if (meeting.host.toString() !== userId) {
      res.status(403).json({ error: 'Solo el anfitrión puede borrarla' });
      return;
    }
    await roomService()
      .deleteRoom(roomNameFor(meeting.code))
      .catch(() => {});
    await meeting.deleteOne();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'No se pudo borrar la reunión' });
  }
}

export async function endMeeting(req: AuthRequest, res: Response): Promise<void> {
  try {
    const meeting = await hostedMeeting(req.params.code, req.userId!, res);
    if (!meeting) return;

    meeting.status = 'ended';
    meeting.endedAt = new Date();
    await meeting.save();

    // Si nadie llegó a entrar, la room nunca existió en LiveKit: no es un error.
    await roomService()
      .deleteRoom(roomNameFor(meeting.code))
      .catch(() => {});

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'No se pudo terminar la reunión' });
  }
}
