import * as dotenv from 'dotenv';
import app from './app';

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

// Obsługa sygnałów zamknięcia (Ctrl+C, zamykanie procesu, itp.)
process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
