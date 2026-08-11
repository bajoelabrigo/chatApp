import { Response } from 'express';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { Seminar } from '../models/Seminar';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/authMiddleware';
import { isGlobalAdmin } from '../services/adminService';
import { deleteCloudinaryUrls } from '../services/cloudinaryService';
import { hasSeminarAccess, lockClasses } from '../utils/seminarAccess';

function formatBytes(bytes?: number): string | undefined {
  if (bytes == null || Number.isNaN(bytes)) return undefined;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// GET /seminars — catálogo de seminarios habilitados.
export async function listSeminars(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const seminars = await Seminar.find({ 'seminar.enabled': true })
      .select('title description coverImage startDate endDate participants seminar.classes._id')
      .lean();
    res.json(
      seminars.map((s: any) => ({
        _id: s._id,
        title: s.title,
        description: s.description,
        coverImage: s.coverImage,
        startDate: s.startDate,
        endDate: s.endDate,
        participantsCount: s.participants?.length ?? 0,
        classCount: s.seminar?.classes?.length ?? 0,
      }))
    );
  } catch (err) {
    console.error('listSeminars:', err);
    res.status(500).json({ error: 'Error obteniendo seminarios' });
  }
}

// GET /seminars/mine — seminarios en los que estoy inscrito, con mi progreso.
export async function listMySeminars(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    // Nota: Mongo no permite `$elemMatch` de proyección sobre un campo con ruta
    // de puntos (`seminar.studentProgress`) — "Cannot use $elemMatch projection
    // on a nested field." Se trae el array completo y se filtra en JS, mismo
    // patrón que usa `getSeminarProgress` en la web.
    const seminars = await Seminar.find({ 'seminar.enabled': true, 'participants.user': userId })
      .select('title description coverImage startDate endDate seminar.classes._id seminar.studentProgress')
      .lean();
    res.json(
      seminars.map((s: any) => {
        const progress = (s.seminar?.studentProgress ?? []).find((p: any) => p.user?.toString() === userId);
        const totalClasses = s.seminar?.classes?.length ?? 0;
        const completedClasses = progress?.completedClasses?.length ?? 0;
        return {
          _id: s._id,
          title: s.title,
          description: s.description,
          coverImage: s.coverImage,
          startDate: s.startDate,
          endDate: s.endDate,
          totalClasses,
          completedClasses,
          hasCertificate: !!progress?.certificate?.code,
        };
      })
    );
  } catch (err) {
    console.error('listMySeminars:', err);
    res.status(500).json({ error: 'Error obteniendo mis seminarios' });
  }
}

// GET /seminars/:id — detalle. Sin acceso: se ocultan video/materiales/participantes.
export async function getSeminarDetails(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const activity = await Seminar.findById(req.params.id)
      .select('-seminar.studentProgress')
      .populate('createdBy', 'name avatar')
      .lean();
    if (!activity || !(activity as any).seminar?.enabled) {
      res.status(404).json({ error: 'Seminario no encontrado' });
      return;
    }

    const isAdmin = await isGlobalAdmin(userId);
    const access = hasSeminarAccess(activity as any, userId, isAdmin);
    const sorted = [...(activity as any).seminar.classes].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

    const result: any = {
      ...activity,
      seminar: { ...(activity as any).seminar, classes: lockClasses(sorted, access) },
      isEnrolled: access,
      participantsCount: (activity as any).participants?.length ?? 0,
    };
    if (!access) result.participants = [];

    res.json(result);
  } catch (err) {
    console.error('getSeminarDetails:', err);
    res.status(500).json({ error: 'Error obteniendo el seminario' });
  }
}

// GET /seminars/:id/classes — temario (array plano, ordenado).
export async function getSeminarClasses(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const activity = await Seminar.findById(req.params.id);
    if (!activity?.seminar?.enabled) {
      res.status(404).json({ error: 'Este seminario no tiene clases' });
      return;
    }
    const isAdmin = await isGlobalAdmin(userId);
    const access = hasSeminarAccess(activity, userId, isAdmin);
    const sorted = [...activity.seminar.classes].sort((a, b) => a.order - b.order);
    res.json(lockClasses(sorted, access));
  } catch (err) {
    console.error('getSeminarClasses:', err);
    res.status(500).json({ error: 'Error obteniendo las clases' });
  }
}

// POST /seminars/:id/join
export async function joinSeminar(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const activity = await Seminar.findById(req.params.id);
    if (!activity) { res.status(404).json({ error: 'Seminario no encontrado' }); return; }

    const already = activity.participants.some((p) => p.user?.toString() === userId);
    if (already) { res.status(400).json({ error: 'Ya estás inscrito en este seminario' }); return; }

    activity.participants.push({ user: new Types.ObjectId(userId) } as any);
    await activity.save();

    res.json({ message: 'Inscripción exitosa' });
  } catch (err) {
    console.error('joinSeminar:', err);
    res.status(500).json({ error: 'Error al inscribirte' });
  }
}

// PATCH /seminars/:id/leave — borra también todo mi progreso (tareas, certificado).
export async function leaveSeminar(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const activity = await Seminar.findById(req.params.id).select('participants');
    if (!activity) { res.status(404).json({ error: 'Seminario no encontrado' }); return; }

    const isParticipant = activity.participants.some((p) => p.user?.toString() === userId);
    if (!isParticipant) { res.status(400).json({ error: 'No estás inscrito en este seminario' }); return; }

    await Seminar.updateOne(
      { _id: req.params.id },
      { $pull: { participants: { user: userId }, 'seminar.studentProgress': { user: userId } } } as any
    );

    res.json({ message: 'Te has retirado del seminario y se eliminaron tus registros' });
  } catch (err) {
    console.error('leaveSeminar:', err);
    res.status(500).json({ error: 'Error al salir del seminario' });
  }
}

// PATCH /seminars/:id/classes/:classId/mark-completed
export async function markClassCompleted(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id, classId } = req.params;

    const activity = await Seminar.findById(id).select('seminar.enabled participants createdBy');
    if (!activity?.seminar?.enabled) { res.status(404).json({ error: 'Seminario no encontrado' }); return; }

    const isAdmin = await isGlobalAdmin(userId);
    if (!hasSeminarAccess(activity, userId, isAdmin)) {
      res.status(403).json({ error: 'Debes inscribirte en el seminario para hacer esto' });
      return;
    }

    await Seminar.updateOne(
      { _id: id, 'seminar.studentProgress.user': { $ne: userId } },
      { $push: { 'seminar.studentProgress': { user: userId, completedClasses: [], tasks: [] } } }
    );
    await Seminar.updateOne(
      { _id: id },
      { $addToSet: { 'seminar.studentProgress.$[s].completedClasses': new Types.ObjectId(classId) } },
      { arrayFilters: [{ 's.user': new Types.ObjectId(userId) }] }
    );

    res.json({ message: 'Clase marcada como completada' });
  } catch (err) {
    console.error('markClassCompleted:', err);
    res.status(500).json({ error: 'Error al marcar la clase' });
  }
}

// GET /seminars/:id/progress — mi progreso (nunca el de nadie más).
export async function getMyProgress(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    // Ver nota en `listMySeminars`: $elemMatch de proyección no admite rutas
    // con puntos, así que se trae el array completo y se filtra en JS.
    const activity = await Seminar.findById(req.params.id)
      .select('seminar.enabled seminar.studentProgress')
      .lean();
    if (!activity || !(activity as any).seminar?.enabled) {
      res.status(404).json({ error: 'Seminario no disponible' });
      return;
    }
    const progress = (activity as any).seminar.studentProgress?.find((p: any) => p.user?.toString() === userId);
    res.json(progress ?? { completedClasses: [], tasks: [] });
  } catch (err) {
    console.error('getMyProgress:', err);
    res.status(500).json({ error: 'Error obteniendo el progreso' });
  }
}

// GET /seminars/:id/certificate — código idempotente, solo si completé todo.
export async function getMyCertificate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const activity = await Seminar.findById(req.params.id)
      .select('title createdBy seminar.enabled seminar.classes._id seminar.studentProgress')
      .lean();
    if (!activity || !(activity as any).seminar?.enabled) {
      res.status(404).json({ error: 'Seminario no encontrado' });
      return;
    }

    const classes = (activity as any).seminar.classes ?? [];
    if (classes.length === 0) { res.status(400).json({ error: 'El seminario todavía no tiene clases' }); return; }

    const progress = (activity as any).seminar.studentProgress?.find((p: any) => p.user?.toString() === userId);
    const done = new Set((progress?.completedClasses ?? []).map((c: any) => c.toString()));
    const completed = classes.filter((c: any) => done.has(c._id.toString())).length;

    if (completed < classes.length) {
      res.status(403).json({ error: 'Aún no has completado todas las clases', completed, total: classes.length });
      return;
    }

    let code = progress?.certificate?.code as string | undefined;
    let issuedAt = progress?.certificate?.issuedAt as Date | undefined;

    if (!code) {
      code = `HHH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      issuedAt = new Date();
      await Seminar.updateOne(
        { _id: req.params.id },
        { $set: { 'seminar.studentProgress.$[s].certificate': { code, issuedAt } } },
        { arrayFilters: [{ 's.user': new Types.ObjectId(userId) }] }
      );
    }

    const user = await User.findById(userId).select('name').lean();
    res.json({
      code, issuedAt,
      studentName: user?.name,
      seminarTitle: (activity as any).title,
      totalClasses: classes.length,
    });
  } catch (err) {
    console.error('getMyCertificate:', err);
    res.status(500).json({ error: 'Error obteniendo la constancia' });
  }
}

// POST /seminars/:id/classes/:classId/task — sube/reemplaza mi tarea. El
// cliente ya subió el archivo vía POST /upload; aquí solo se manda la URL
// resultante. A diferencia de la web: conserva el archivo/mensaje/comentario
// existentes si no llega uno nuevo, y siempre limpia el archivo reemplazado.
export async function uploadTask(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id, classId } = req.params;
    const { fileUrl, fileName, fileFormat, fileSizeBytes, message } = req.body as {
      fileUrl?: string; fileName?: string; fileFormat?: string; fileSizeBytes?: number; message?: string;
    };

    const activity = await Seminar.findById(id);
    if (!activity?.seminar?.enabled) { res.status(404).json({ error: 'Seminario no encontrado' }); return; }

    const isAdmin = await isGlobalAdmin(userId);
    if (!hasSeminarAccess(activity, userId, isAdmin)) {
      res.status(403).json({ error: 'Debes inscribirte en el seminario para hacer esto' });
      return;
    }

    const existingProgress = activity.seminar.studentProgress.find((p) => p.user.toString() === userId);
    const existingTask = existingProgress?.tasks.find((t) => t.classId?.toString() === classId);

    const nextFileUrl = fileUrl ?? existingTask?.fileUrl;
    const nextFileName = fileUrl ? fileName : existingTask?.fileName;
    const nextFileFormat = fileUrl ? fileFormat : existingTask?.fileFormat;
    const nextFileSize = fileUrl ? formatBytes(fileSizeBytes) : existingTask?.fileSize;
    const nextMessage = message ?? existingTask?.message;
    const studentComment = existingTask?.studentComment;

    if (fileUrl && existingTask?.fileUrl && existingTask.fileUrl !== fileUrl) {
      deleteCloudinaryUrls([existingTask.fileUrl]).catch(() => {});
    }

    await Seminar.updateOne(
      { _id: id, 'seminar.studentProgress.user': { $ne: userId } },
      { $push: { 'seminar.studentProgress': { user: userId, completedClasses: [], tasks: [] } } }
    );
    await Seminar.updateOne(
      { _id: id },
      { $pull: { 'seminar.studentProgress.$[s].tasks': { classId: new Types.ObjectId(classId) } } },
      { arrayFilters: [{ 's.user': new Types.ObjectId(userId) }] }
    );
    await Seminar.updateOne(
      { _id: id },
      {
        $push: {
          'seminar.studentProgress.$[s].tasks': {
            classId: new Types.ObjectId(classId),
            fileUrl: nextFileUrl, fileName: nextFileName, fileFormat: nextFileFormat, fileSize: nextFileSize,
            message: nextMessage, studentComment,
            status: 'enviado', submittedAt: new Date(),
          },
        },
      },
      { arrayFilters: [{ 's.user': new Types.ObjectId(userId) }] }
    );

    res.status(201).json({ message: 'Tarea enviada correctamente' });
  } catch (err) {
    console.error('uploadTask:', err);
    res.status(500).json({ error: 'Error al enviar la tarea' });
  }
}

// DELETE /seminars/:id/classes/:classId/task
export async function deleteMyTask(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id, classId } = req.params;

    const activity = await Seminar.findById(id).select('seminar.enabled seminar.studentProgress');
    if (!activity?.seminar?.enabled) { res.status(404).json({ error: 'Seminario no encontrado' }); return; }

    const progress = activity.seminar.studentProgress.find((p) => p.user.toString() === userId);
    const task = progress?.tasks.find((t) => t.classId?.toString() === classId);
    if (!task) { res.status(404).json({ error: 'No tienes una tarea entregada en esta clase' }); return; }

    await Seminar.updateOne(
      { _id: id },
      { $pull: { 'seminar.studentProgress.$[s].tasks': { classId: new Types.ObjectId(classId) } } },
      { arrayFilters: [{ 's.user': new Types.ObjectId(userId) }] }
    );
    if (task.fileUrl) deleteCloudinaryUrls([task.fileUrl]).catch(() => {});

    res.json({ message: 'Tarea eliminada' });
  } catch (err) {
    console.error('deleteMyTask:', err);
    res.status(500).json({ error: 'Error al eliminar la tarea' });
  }
}

// PATCH /seminars/:id/classes/:classId/student-comment
export async function updateStudentComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id, classId } = req.params;
    const { studentComment } = req.body as { studentComment?: string };

    const activity = await Seminar.findById(id).select('seminar.enabled seminar.studentProgress');
    if (!activity?.seminar?.enabled) { res.status(404).json({ error: 'Seminario no encontrado' }); return; }

    const progress = activity.seminar.studentProgress.find((p) => p.user.toString() === userId);
    if (!progress) { res.status(404).json({ error: 'Progreso no encontrado' }); return; }

    const hasTask = progress.tasks.some((t) => t.classId?.toString() === classId);
    if (hasTask) {
      await Seminar.updateOne(
        { _id: id },
        { $set: { 'seminar.studentProgress.$[s].tasks.$[t].studentComment': studentComment } },
        { arrayFilters: [{ 's.user': new Types.ObjectId(userId) }, { 't.classId': new Types.ObjectId(classId) }] }
      );
    } else {
      await Seminar.updateOne(
        { _id: id },
        { $push: { 'seminar.studentProgress.$[s].tasks': { classId: new Types.ObjectId(classId), studentComment } } },
        { arrayFilters: [{ 's.user': new Types.ObjectId(userId) }] }
      );
    }

    res.json({ message: 'Comentario actualizado' });
  } catch (err) {
    console.error('updateStudentComment:', err);
    res.status(500).json({ error: 'Error actualizando el comentario' });
  }
}

// GET /seminars/:id/classes/:classId/my-task — 200 null si no hay ninguna.
export async function getMyTaskForClass(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id, classId } = req.params;
    const activity = await Seminar.findById(id)
      .select('seminar.studentProgress')
      .lean();
    const progress = (activity as any)?.seminar?.studentProgress?.find((p: any) => p.user?.toString() === userId);
    const task = progress?.tasks?.find((t: any) => t.classId?.toString() === classId) ?? null;
    res.json(task);
  } catch (err) {
    console.error('getMyTaskForClass:', err);
    res.status(500).json({ error: 'Error obteniendo la tarea' });
  }
}
