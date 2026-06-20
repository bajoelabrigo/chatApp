import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
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
import bibleRoutes from './routes/bible.routes';
import offeringRoutes from './routes/offering.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';
import { setupSocketHandlers } from './socket/socketHandler';
import { setIO } from './socket/ioSingleton';
import { startCronJobs } from './services/cronService';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/conversations', conversationRoutes);
app.use('/upload', uploadRoutes);
app.use('/users', userRoutes);
app.use('/groups', groupRoutes);
app.use('/groups/:groupId/activities', activityRoutes);
app.use('/groups/:groupId/prayer-requests', prayerRoutes);
app.use('/calls', callRoutes);
app.use('/bible', bibleRoutes);
app.use('/offerings', offeringRoutes);
app.use('/notifications', notificationRoutes);
app.use('/admin', adminRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

setIO(io);
setupSocketHandlers(io);

connectDB()
  .then(() => {
    startCronJobs();
    server.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error conectando a MongoDB:', err);
    process.exit(1);
  });
