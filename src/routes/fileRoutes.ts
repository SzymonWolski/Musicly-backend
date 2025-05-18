import { Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { sql } from 'bun';
import * as musicMetadata from 'music-metadata';

const router = Router();

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
    const { nazwa_utworu, data_wydania, kryptonim_artystyczny } = req.body;
    
    if (!nazwa_utworu || !data_wydania || !kryptonim_artystyczny) {
      // Usuń plik jeśli nie ma wszystkich danych
      fs.unlinkSync(path.join('/app/uploads', req.file.filename));
      res.status(400).json({ message: 'Brakuje wymaganych danych utworu' });
      return;
    }
    
    // Sprawdź czy autor istnieje
    let autorId;
    const autorResult = await sql`
      SELECT "ID_autora" FROM "Autorzy" 
      WHERE kryptonim_artystyczny = ${kryptonim_artystyczny}
    `;
    
    if (autorResult.length === 0) {
      // Autor nie istnieje, stwórz nowego
      const nowyAutorResult = await sql`
        INSERT INTO "Autorzy" (imie, nazwisko, kryptonim_artystyczny)
        VALUES ('', '', ${kryptonim_artystyczny})
        RETURNING "ID_autora"
      `;
      autorId = nowyAutorResult[0].ID_autora;
    } else {
      // Autor istnieje
      autorId = autorResult[0].ID_autora;
    }

    // Pobierz czas trwania pliku audio automatycznie
    const filePath = path.join('/app/uploads', req.file.filename);
    const metadata = await musicMetadata.parseFile(filePath);

    // Zapisz informacje o utworze w bazie danych używając SQL, dopasowane do schematu tabeli
    const result = await sql`
      INSERT INTO "Utwor" (
        nazwa_utworu,
        data_wydania,
        "ID_autora",
        filename,
        filepath,
        mimetype,
        filesize
      ) VALUES (
        ${nazwa_utworu || ''},
        ${data_wydania || ''},
        ${autorId}, 
        ${req.file.filename || null},
        ${`/app/uploads/${req.file.filename}` || null},
        ${req.file.mimetype || null},
        ${req.file.size || null}
      )
      RETURNING "ID_utworu", nazwa_utworu, data_wydania, "ID_autora", 
               filename, filepath, mimetype, filesize
    `;
    
    const utwor = result[0];
    
    // Pobierz informacje o autorze do odpowiedzi
    const autorInfo = await sql`
      SELECT imie, nazwisko, kryptonim_artystyczny
      FROM "Autorzy"
      WHERE "ID_autora" = ${autorId}
    `;
    
    // Zwracamy informacje o przesłanym utworu wraz z informacją o autorze
    res.status(201).json({
      message: 'Utwór przesłany pomyślnie',
      utwor: {
        ...utwor,
        autor: autorInfo[0]
      }
    });
  } catch (error) {
    console.error('Błąd podczas przesyłania pliku:', error);
    
    // Usuń plik w przypadku błędu
    if (req.file) {
      fs.unlinkSync(path.join('/app/uploads', req.file.filename));
    }
    
    res.status(500).json({ message: 'Błąd serwera podczas przesyłania pliku' });
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

// Endpoint do listowania utworów - obsługuje GET i POST dla wyszukiwania
router.get('/list', async (req: Request, res: Response): Promise<void> => {
  try {
    // Sprawdź czy są parametry wyszukiwania w query string
    const searchQuery = req.query.search as string | undefined;
    
    // Podstawowe zapytanie
    let query = `
      SELECT 
        u."ID_utworu", 
        u.nazwa_utworu, 
        u.data_wydania, 
        u.filename, 
        u.mimetype, 
        u.filesize,
        a.imie, 
        a.nazwisko, 
        a.kryptonim_artystyczny
      FROM "Utwor" u
      JOIN "Autorzy" a ON u."ID_autora" = a."ID_autora"
    `;
    
    // Jeśli podano parametr wyszukiwania, dodaj warunek WHERE
    let params = [];
    if (searchQuery) {
      query += ` 
        WHERE LOWER(u.nazwa_utworu) LIKE LOWER($1)
        OR LOWER(a.kryptonim_artystyczny) LIKE LOWER($1)
      `;
      params.push(`%${searchQuery}%`);
    }
    
    // Dodaj sortowanie
    query += ` ORDER BY u."ID_utworu" DESC`;
    
    // Wykonaj zapytanie
    const utwory = await sql.unsafe(query, params);
    
    // Przekształć wyniki do oczekiwanego formatu
    const formattedUtwory = utwory.map((utwor: any) => ({
      ID_utworu: utwor.ID_utworu,
      nazwa_utworu: utwor.nazwa_utworu,
      data_wydania: utwor.data_wydania,
      filename: utwor.filename,
      mimetype: utwor.mimetype,
      filesize: utwor.filesize,
      Autor: {
        imie: utwor.imie,
        nazwisko: utwor.nazwisko,
        kryptonim_artystyczny: utwor.kryptonim_artystyczny
      }
    }));
    
    res.json({ 
      success: true,
      utwory: formattedUtwory 
    });
  } catch (error) {
    console.error('Błąd podczas listowania utworów:', error);
    res.status(500).json({ 
      success: false,
      message: 'Błąd serwera podczas listowania utworów' 
    });
  }
});

// Dodatkowy endpoint POST dla wyszukiwania utworów
router.post('/list', async (req: Request, res: Response): Promise<void> => {
  try {
    const { searchQuery } = req.body;
    
    let query = `
      SELECT 
        u."ID_utworu", 
        u.nazwa_utworu, 
        u.data_wydania, 
        u.filename, 
        u.mimetype, 
        u.filesize,
        a.imie, 
        a.nazwisko, 
        a.kryptonim_artystyczny
      FROM "Utwor" u
      JOIN "Autorzy" a ON u."ID_autora" = a."ID_autora"
    `;
    
    let params = [];
    if (searchQuery && searchQuery.trim() !== '') {
      query += `
        WHERE LOWER(u.nazwa_utworu) LIKE LOWER($1)
        OR LOWER(a.kryptonim_artystyczny) LIKE LOWER($1)
      `;
      params.push(`%${searchQuery}%`);
    }
    
    query += ` ORDER BY u."ID_utworu" DESC`;
    
    const utwory = await sql.unsafe(query, params);
    
    const formattedUtwory = utwory.map((utwor: any) => ({
      ID_utworu: utwor.ID_utworu,
      nazwa_utworu: utwor.nazwa_utworu,
      data_wydania: utwor.data_wydania,
      filename: utwor.filename,
      mimetype: utwor.mimetype,
      filesize: utwor.filesize,
      Autor: {
        imie: utwor.imie,
        nazwisko: utwor.nazwisko,
        kryptonim_artystyczny: utwor.kryptonim_artystyczny
      }
    }));
    
    res.json({ 
      success: true,
      utwory: formattedUtwory 
    });
  } catch (error) {
    console.error('Błąd podczas wyszukiwania utworów:', error);
    res.status(500).json({ 
      success: false,
      message: 'Błąd serwera podczas wyszukiwania utworów' 
    });
  }
});

// Endpoint do usuwania utworu
router.delete('/delete/:utworId', async (req: Request<{utworId: string}>, res: Response): Promise<void> => {
  try {
    const { utworId } = req.params;
    const id = parseInt(utworId);
    
    // Pobierz informacje o utworze z bazy danych wraz z danymi autora
    const result = await sql`
      SELECT u.*, a.imie, a.nazwisko, a.kryptonim_artystyczny  
      FROM "Utwor" u
      LEFT JOIN "Autorzy" a ON u."ID_autora" = a."ID_autora"
      WHERE u."ID_utworu" = ${id}
    `;
    
    if (result.length === 0) {
      res.status(404).json({ 
        success: false, 
        message: 'Utwór nie istnieje' 
      });
      return;
    }
    
    const utwor = result[0];
    
    // Usuń plik z dysku jeśli istnieje
    if (utwor.filepath && fs.existsSync(utwor.filepath)) {
      fs.unlinkSync(utwor.filepath);
    }
    
    // Użyj sql.begin zamiast BEGIN/COMMIT bezpośrednio
    await sql.begin(async (transaction) => {
      // Usuń numeracje utworu
      await transaction`DELETE FROM "Numeracja_utworu" WHERE "ID_utworu" = ${id}`;
      
      // Usuń powiązania z playlistami
      await transaction`DELETE FROM "PlaylistaUtwor" WHERE "ID_utworu" = ${id}`;
      
      // Usuń polubienia
      await transaction`DELETE FROM "Polubienia" WHERE "ID_piosenki" = ${id}`;
      
      // Na koniec usuń sam utwór
      await transaction`DELETE FROM "Utwor" WHERE "ID_utworu" = ${id}`;
    });
    
    // Zwróć sukces wraz z informacją o usuniętym utworze
    res.json({
      success: true,
      message: 'Piosenka została pomyślnie usunięta',
      data: {
        ID_utworu: utwor.ID_utworu,
        nazwa_utworu: utwor.nazwa_utworu,
        data_wydania: utwor.data_wydania,
        Autor: {
          imie: utwor.imie,
          nazwisko: utwor.nazwisko,
          kryptonim_artystyczny: utwor.kryptonim_artystyczny
        }
      }
    });
  } catch (error) {
    console.error('Błąd podczas usuwania utworu:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Wystąpił błąd podczas usuwania piosenki. Spróbuj ponownie później.',
      error: (error instanceof Error) ? error.message : 'Nieznany błąd'  
    });
  }
});

// Endpoint do odtwarzania plików audio
router.get('/play/:utworId', async (req: Request<{utworId: string}>, res: Response): Promise<void> => {
  try {
    const { utworId } = req.params;
    const id = parseInt(utworId);
    
    // Pobierz informacje o utworze z bazy danych
    const result = await sql`
      SELECT filepath, filename, mimetype
      FROM "Utwor"
      WHERE "ID_utworu" = ${id}
    `;
    
    if (result.length === 0 || !result[0].filepath) {
      res.status(404).json({ 
        success: false,
        message: 'Utwór nie istnieje lub nie ma powiązanego pliku' 
      });
      return;
    }
    
    const utwor = result[0];
    const filePath = utwor.filepath;
    
    // Sprawdzamy, czy plik istnieje
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ 
        success: false,
        message: 'Plik fizyczny nie istnieje'
      });
      return;
    }
    
    // Pobierz statystyki pliku dla określenia rozmiaru
    const stat = fs.statSync(filePath);
    
    // Pobierz zakres bajtów, jeśli klient go żąda (do streamowania)
    const range = req.headers.range;
    
    if (range) {
      // Parsuj zakres bajtów
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = (end - start) + 1;
      
      // Utwórz strumień odczytu pliku
      const fileStream = fs.createReadStream(filePath, { start, end });
      
      // Ustaw odpowiednie nagłówki dla streamowanego zakresu
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': utwor.mimetype || 'audio/mpeg',
      });
      
      // Stream pliku do klienta
      fileStream.pipe(res);
    } else {
      // Jeśli zakres nie jest określony, wyślij cały plik
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': utwor.mimetype || 'audio/mpeg',
        'Accept-Ranges': 'bytes',
      });
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    }
    
  } catch (error) {
    console.error('Błąd podczas streamowania pliku audio:', error);
    res.status(500).json({ 
      success: false,
      message: 'Błąd serwera podczas streamowania pliku audio' 
    });
  }
});

export default router;