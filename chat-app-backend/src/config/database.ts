import mongoose from 'mongoose';

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI no está definido en .env');

  await mongoose.connect(uri);
  console.log('MongoDB conectado');
}
