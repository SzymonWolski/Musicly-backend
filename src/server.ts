import * as dotenv from 'dotenv';
import app from './app';
import authRouter from './routes/authRoutes';
import express from 'express';
import { sql } from 'bun';

dotenv.config();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5000;

const handleShutdown = async () => {
  console.log('Program prawie się kończy...');

  try {
    console.log('Zamykamy połączenie z bazą danych itp wykonujemy operacje przed zamknięciem programu...');
    console.log('...ale jeszcze coś zrobiliśmy.');
  } catch (error) {
    console.error('Błąd podczas aktualizacji bazy danych:', error);
  } finally {
    process.exit(0);
  }
};

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Lub konkretny adres frontendu (np. http://localhost:5173)
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Obsługa sygnałów zamknięcia (Ctrl+C, zamykanie procesu, itp.)
process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

app.use('/api/auth', authRouter);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
