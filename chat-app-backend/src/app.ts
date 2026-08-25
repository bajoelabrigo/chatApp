import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { Server } from 'socket.io';
import { connectDB } from './config/database';
import authRoutes from './routes/auth.routes';
import conversationRoutes from './routes/conversation.routes';
import uploadRoutes from './routes/upload.routes';
import userRoutes from './routes/user.routes';
import groupRoutes from './routes/group.routes';
import activityRoutes from './routes/activity.routes';
import prayerRoutes from './routes/prayer.routes';
import callRoutes from './routes/call.routes';
import meetingRoutes from './routes/meeting.routes';
import bibleRoutes from './routes/bible.routes';
import offeringRoutes from './routes/offering.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';
import materialRoutes from './routes/material.routes';
import postRoutes from './routes/post.routes';
import connectionRoutes from './routes/connection.routes';
import seminarRoutes from './routes/seminar.routes';
import publicRoutes from './routes/public.routes';
import popupRoutes from './routes/popup.routes';
import reelRoutes from './routes/reel.routes';
import { setupSocketHandlers } from './socket/socketHandler';
import { setIO } from './socket/ioSingleton';
import { startCronJobs } from './services/cronService';
import { logger, installProcessHandlers } from './services/logger';

// Antes de nada: sin esto, una promesa sin `.catch` tumba el proceso entero
// (Node 24) sin dejar ni una línea que diga de dónde salió.
installProcessHandlers();

const log = logger('app');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || 3000;

// Detrás de nginx (un solo salto). Sin esto `req.ip` sería siempre la IP del
// proxy y los límites de `middleware/rateLimit.ts` se aplicarían a todos los
// usuarios en bloque en vez de por cliente.
app.set('trust proxy', 1);

app.use(cors());

// Una línea por petición, con marca de tiempo. Se salta /health porque el
// chequeo de disponibilidad lo pide cada pocos segundos y ahogaría el log.
// morgan NO registra cuerpos, así que las contraseñas no acaban en disco.
app.use(morgan(':date[iso] HTTP  :method :url :status :res[content-length] - :response-time ms', {
  skip: (req) => req.url === '/health',
}));

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/conversations', conversationRoutes);
app.use('/upload', uploadRoutes);
app.use('/users', userRoutes);
app.use('/groups', groupRoutes);
app.use('/groups/:groupId/activities', activityRoutes);
app.use('/groups/:groupId/prayer-requests', prayerRoutes);
app.use('/calls', callRoutes);
app.use('/meetings', meetingRoutes);
app.use('/bible', bibleRoutes);
app.use('/offerings', offeringRoutes);
app.use('/notifications', notificationRoutes);
app.use('/admin', adminRoutes);
app.use('/materials', materialRoutes);
app.use('/posts', postRoutes);
app.use('/connections', connectionRoutes);
app.use('/seminars', seminarRoutes);
app.use('/public', publicRoutes);
app.use('/popup', popupRoutes);
app.use('/reels', reelRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

setIO(io);
setupSocketHandlers(io);

connectDB()
  .then(() => {
    startCronJobs();
    server.listen(PORT, () => {
      log.info(`Servidor escuchando en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    log.error('No se pudo conectar a MongoDB; el proceso no puede arrancar', err);
    process.exit(1);
  });
