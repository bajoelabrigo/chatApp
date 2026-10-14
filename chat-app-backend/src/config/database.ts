import mongoose from 'mongoose';

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI no está definido en .env');

  // Si Atlas se queda sin primario (ReplicaSetNoPrimary, pasó el 2-3/oct/2026),
  // cada consulta esperaba 30 s (valor por defecto) antes de fallar. Con 10 s
  // el cliente recibe el error antes y React Query reintenta. Espejo en
  // holy_app/backend/server.js.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  console.log('MongoDB conectado');
}
