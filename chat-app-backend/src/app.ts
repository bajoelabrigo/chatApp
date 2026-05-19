import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { connectDB } from './config/database';
import authRoutes from './routes/auth.routes';
import conversationRoutes from './routes/conversation.routes';
import { setupSocketHandlers } from './socket/socketHandler';

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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

setupSocketHandlers(io);

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error conectando a MongoDB:', err);
    process.exit(1);
  });
