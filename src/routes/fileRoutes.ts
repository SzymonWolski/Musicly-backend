import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { sql } from 'bun';

const router = express.Router();

// Konfiguracja multer dla przechowywania plików
const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, '/app/uploads');
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    // Generowanie unikalnej nazwy pliku z zachowaniem oryginalnego rozszerzenia
    const fileExt = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExt}`;
    cb(null, fileName);
  }
});

// Filtr plików - akceptowanie tylko plików audio
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Sprawdź czy plik jest plikiem audio
  if (file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('Tylko pliki audio są dozwolone'));
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // Limit 50MB dla plików audio
});

// Typowanie dla req.file
interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}

// Endpoint do przesyłania plików audio jako utwory muzyczne
router.post('/upload', upload.single('file'), async (req: RequestWithFile, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'Nie przesłano pliku audio' });
      return;
    }

    // Sprawdź czy wszystkie wymagane dane są przesłane
    const { nazwa_utworu, czas_trwania, data_wydania, ID_autora } = req.body;
    
    if (!nazwa_utworu || !czas_trwania || !data_wydania || !ID_autora) {
      // Usuń plik jeśli nie ma wszystkich danych
      fs.unlinkSync(path.join('/app/uploads', req.file.filename));
      res.status(400).json({ message: 'Brakuje wymaganych danych utworu' });
      return;
    }

    // Zapisz informacje o utworze w bazie danych używając SQL
    const result = await sql`
      INSERT INTO "Utwor" (
        nazwa_utworu, 
        czas_trwania, 
        data_wydania, 
        "ID_autora", 
        filename, 
        filepath, 
        mimetype, 
        filesize
      ) VALUES (
        ${nazwa_utworu || ''}, 
        ${parseInt(czas_trwania) || 0}, 
        ${data_wydania || ''}, 
        ${parseInt(ID_autora) || 0}, 
        ${req.file.filename || ''}, 
        ${`/app/uploads/${req.file.filename}` || ''}, 
        ${req.file.mimetype || ''}, 
        ${req.file.size || 0}
      )
      RETURNING "ID_utworu", nazwa_utworu, czas_trwania, data_wydania, "ID_autora", 
               filename, filepath, mimetype, filesize
    `;
    
    const utwor = result[0];
    
    // Zwracamy informacje o przesłanym utworu
    res.status(201).json({
      message: 'Utwór przesłany pomyślnie',
      utwor
    });
  } catch (error) {
    console.error('Błąd podczas przesyłania utworu:', error);
    
    // Usuń plik w przypadku błędu
    if (req.file) {
      fs.unlinkSync(path.join('/app/uploads', req.file.filename));
    }
    
    res.status(500).json({ message: 'Błąd serwera podczas przesyłania pliku' });
  }
});

// Endpoint do pobierania plików po ID utworu
router.get('/download/:utworId', async (req: Request<{utworId: string}>, res: Response): Promise<void> => {
  try {
    const { utworId } = req.params;
    
    // Pobierz informacje o utworze z bazy danych
    const result = await sql`
      SELECT * FROM "Utwor" WHERE "ID_utworu" = ${parseInt(utworId)}
    `;
    
    if (result.length === 0 || !result[0].filepath) {
      res.status(404).json({ message: 'Utwór nie istnieje lub nie ma powiązanego pliku' });
      return;
    }
    
    const utwor = result[0];
    const filePath = utwor.filepath;
    
    // Sprawdzamy, czy plik istnieje
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: 'Plik fizyczny nie istnieje' });
      return;
    }
    
    // Wysyłamy plik z oryginalną nazwą
    res.download(filePath, utwor.nazwa_utworu + path.extname(utwor.filename));
  } catch (error) {
    console.error('Błąd podczas pobierania utworu:', error);
    res.status(500).json({ message: 'Błąd serwera podczas pobierania pliku' });
  }
});

// Endpoint do pobierania plików po nazwie pliku (dla kompatybilności)
router.get('/download/by-filename/:filename', async (req: Request<{filename: string}>, res: Response): Promise<void> => {
  try {
    const { filename } = req.params;
    
    // Pobierz informacje o utworze z bazy danych
    const result = await sql`
      SELECT * FROM "Utwor" WHERE filename = ${filename}
    `;
    
    if (result.length === 0 || !result[0].filepath) {
      res.status(404).json({ message: 'Utwór nie istnieje lub nie ma powiązanego pliku' });
      return;
    }
    
    const utwor = result[0];
    
    // Sprawdzamy, czy plik istnieje
    if (!fs.existsSync(utwor.filepath)) {
      res.status(404).json({ message: 'Plik fizyczny nie istnieje' });
      return;
    }
    
    // Wysyłamy plik
    res.download(utwor.filepath, utwor.nazwa_utworu + path.extname(utwor.filename));
  } catch (error) {
    console.error('Błąd podczas pobierania utworu:', error);
    res.status(500).json({ message: 'Błąd serwera podczas pobierania pliku' });
  }
});

interface Utwor {
  ID_utworu: number;
  nazwa_utworu: string;
  data_wydania: string;
  czas_trwania: number;
  filename: string;
  mimetype: string;
  filesize: number;
  imie: string;
  nazwisko: string;
  kryptonim_artystyczny: string;
}

// Endpoint do listowania utworów
router.get('/list', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Pobierz utwory z informacjami o autorze
    const utwory = await sql`
      SELECT 
        u."ID_utworu", 
        u.nazwa_utworu, 
        u.data_wydania, 
        u.czas_trwania, 
        u.filename, 
        u.mimetype, 
        u.filesize,
        a.imie, 
        a.nazwisko, 
        a.kryptonim_artystyczny
      FROM "Utwor" u
      JOIN "Autorzy" a ON u."ID_autora" = a."ID_autora"
      ORDER BY u."ID_utworu" DESC
    `;
    
    // Przekształć wyniki do oczekiwanego formatu
    const formattedUtwory = utwory.map((utwor: Utwor) => ({
      ID_utworu: utwor.ID_utworu,
      nazwa_utworu: utwor.nazwa_utworu,
      data_wydania: utwor.data_wydania,
      czas_trwania: utwor.czas_trwania,
      filename: utwor.filename,
      mimetype: utwor.mimetype,
      filesize: utwor.filesize,
      Autor: {
        imie: utwor.imie,
        nazwisko: utwor.nazwisko,
        kryptonim_artystyczny: utwor.kryptonim_artystyczny
      }
    }));
    
    res.json({ utwory: formattedUtwory });
  } catch (error) {
    console.error('Błąd podczas listowania utworów:', error);
    res.status(500).json({ message: 'Błąd serwera podczas listowania utworów' });
  }
});

// Endpoint do usuwania utworu
router.delete('/delete/:utworId', async (req: Request<{utworId: string}>, res: Response): Promise<void> => {
  try {
    const { utworId } = req.params;
    const id = parseInt(utworId);
    
    // Pobierz informacje o utworze z bazy danych
    const result = await sql`
      SELECT * FROM "Utwor" WHERE "ID_utworu" = ${id}
    `;
    
    if (result.length === 0) {
      res.status(404).json({ message: 'Utwór nie istnieje' });
      return;
    }
    
    const utwor = result[0];
    
    // Usuń plik z dysku jeśli istnieje
    if (utwor.filepath && fs.existsSync(utwor.filepath)) {
      fs.unlinkSync(utwor.filepath);
    }
    
    // Usuń powiązane rekordy w innych tabelach (w tej samej transakcji)
    // Najpierw usuń zależne rekordy
    await sql`BEGIN`;
    try {
      // Usuń numeracje utworu
      await sql`DELETE FROM "Numeracja_utworu" WHERE "ID_utworu" = ${id}`;
      
      // Usuń powiązania z playlistami
      await sql`DELETE FROM "PlaylistaUtwor" WHERE "ID_utworu" = ${id}`;
      
      // Usuń polubienia
      await sql`DELETE FROM "Polubienia" WHERE "ID_piosenki" = ${id}`;
      
      // Na koniec usuń sam utwór
      await sql`DELETE FROM "Utwor" WHERE "ID_utworu" = ${id}`;
      
      await sql`COMMIT`;
    } catch (error) {
      await sql`ROLLBACK`;
      throw error;
    }
    
    res.json({ message: 'Utwór został pomyślnie usunięty' });
  } catch (error) {
    console.error('Błąd podczas usuwania utworu:', error);
    res.status(500).json({ message: 'Błąd serwera podczas usuwania utworu' });
  }
});

export default router;