import { Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { sql } from 'bun';
import * as musicMetadata from 'music-metadata';
import sharp from 'sharp';

const router = Router();

// Konfiguracja multer dla przechowywania plików audio
const audioStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, '/app/uploads/songs');
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const fileExt = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExt}`;
    cb(null, fileName);
  }
});

// Konfiguracja multer dla przechowywania obrazów
const imageStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, '/app/uploads/song-images');
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const fileExt = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExt}`;
    cb(null, fileName);
  }
});

// Filtr plików - akceptowanie tylko plików audio
const audioFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('Tylko pliki audio są dozwolone'));
  }
};

// Filtr plików - akceptowanie tylko obrazów
const imageFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Tylko pliki obrazów są dozwolone'));
  }
};

const audioUpload = multer({ 
  storage: audioStorage,
  fileFilter: audioFileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // Limit 50MB dla plików audio
});

const imageUpload = multer({ 
  storage: imageStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // Limit 10MB dla obrazów
});

// Typowanie dla req.file
interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}

// Endpoint do przesyłania plików audio jako utwory muzyczne
router.post('/upload', audioUpload.single('file'), async (req: RequestWithFile, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'Nie przesłano pliku audio' });
      return;
    }

    // Sprawdź czy wszystkie wymagane dane są przesłane
    const { nazwa_utworu, data_wydania, kryptonim_artystyczny } = req.body;
    
    if (!nazwa_utworu || !data_wydania || !kryptonim_artystyczny) {
      // Usuń plik jeśli nie ma wszystkich danych
      fs.unlinkSync(path.join('/app/uploads/songs', req.file.filename));
      res.status(400).json({ success: false, message: 'Brakuje wymaganych danych utworu' });
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
    const filePath = path.join('/app/uploads/songs', req.file.filename);
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
        ${`/app/uploads/songs/${req.file.filename}` || null},
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
    res.status(200).json({
      success: true,
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
      fs.unlinkSync(path.join('/app/uploads/songs', req.file.filename));
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Błąd serwera podczas przesyłania pliku' 
    });
  }
});

// Endpoint do przesyłania obrazów utworów
router.post('/upload-image/:utworId', imageUpload.single('image'), async (req: RequestWithFile, res: Response): Promise<void> => {
  try {
    const { utworId } = req.params;
    const id = parseInt(utworId);

    if (!req.file) {
      res.status(400).json({ success: false, message: 'Nie przesłano pliku obrazu' });
      return;
    }

    // Sprawdź czy utwór istnieje
    const utworExists = await sql`
      SELECT "ID_utworu" FROM "Utwor" 
      WHERE "ID_utworu" = ${id}
    `;
    
    if (utworExists.length === 0) {
      fs.unlinkSync(path.join('/app/uploads/song-images', req.file.filename));
      res.status(404).json({
        success: false,
        message: 'Utwór nie istnieje'
      });
      return;
    }

    const tempFilePath = path.join('/app/uploads/song-images', req.file.filename);
    
    try {
      // Sprawdź wymiary obrazu i zmień rozmiar jeśli potrzeba
      const image = sharp(tempFilePath);
      const metadata = await image.metadata();
      
      if (!metadata.width || !metadata.height) {
        fs.unlinkSync(tempFilePath);
        res.status(400).json({
          success: false,
          message: 'Nie można określić wymiarów obrazu'
        });
        return;
      }

      // Jeśli obraz jest większy niż 1000x1000, zmień jego rozmiar
      let processedImage = image;
      if (metadata.width > 1000 || metadata.height > 1000) {
        processedImage = image.resize(1000, 1000, { 
          fit: 'inside',
          withoutEnlargement: true 
        });
      }

      // Zapisz przetworzony obraz
      const finalFileName = `${uuidv4()}.jpg`;
      const finalFilePath = path.join('/app/uploads/song-images', finalFileName);
      
      await processedImage.jpeg({ quality: 90 }).toFile(finalFilePath);
      
      // Usuń oryginalny plik tymczasowy
      fs.unlinkSync(tempFilePath);

      // Pobierz informacje o starym obrazie (jeśli istnieje)
      const oldImageResult = await sql`
        SELECT "imageFilename", "imagePath" FROM "Utwor" 
        WHERE "ID_utworu" = ${id}
      `;

      // Usuń stary obraz jeśli istnieje
      if (oldImageResult[0]?.imagePath && fs.existsSync(oldImageResult[0].imagePath)) {
        fs.unlinkSync(oldImageResult[0].imagePath);
      }

      // Pobierz rozmiar nowego pliku
      const newFileStats = fs.statSync(finalFilePath);

      // Aktualizuj informacje o obrazie w bazie danych
      const updatedUtwor = await sql`
        UPDATE "Utwor" SET
          "imageFilename" = ${finalFileName},
          "imagePath" = ${finalFilePath},
          "imageMimetype" = ${'image/jpeg'},
          "imageSize" = ${newFileStats.size}
        WHERE "ID_utworu" = ${id}
        RETURNING "ID_utworu", "imageFilename", "imagePath", "imageMimetype", "imageSize"
      `;

      res.status(200).json({
        success: true,
        message: 'Obraz utworu przesłany pomyślnie',
        image: updatedUtwor[0]
      });

    } catch (processingError) {
      // Usuń plik w przypadku błędu przetwarzania
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      throw processingError;
    }

  } catch (error) {
    console.error('Błąd podczas przesyłania obrazu:', error);
    
    // Usuń plik w przypadku błędu
    if (req.file) {
      const filePath = path.join('/app/uploads/song-images', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Błąd serwera podczas przesyłania obrazu' 
    });
  }
});

// Endpoint do wyświetlania obrazów utworów
router.get('/image/:utworId', async (req: Request<{utworId: string}>, res: Response): Promise<void> => {
  try {
    const { utworId } = req.params;
    const id = parseInt(utworId);
    
    // Pobierz informacje o obrazie z bazy danych
    const result = await sql`
      SELECT "imagePath", "imageFilename", "imageMimetype"
      FROM "Utwor"
      WHERE "ID_utworu" = ${id}
    `;
    
    if (result.length === 0 || !result[0].imagePath) {
      res.status(404).json({ 
        success: false,
        message: 'Obraz utworu nie istnieje' 
      });
      return;
    }
    
    const image = result[0];
    const filePath = image.imagePath;
    
    // Sprawdź czy plik istnieje
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ 
        success: false,
        message: 'Plik obrazu nie istnieje'
      });
      return;
    }
    
    // Ustaw odpowiednie nagłówki
    res.setHeader('Content-Type', image.imageMimetype || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache na rok
    
    // Wyślij plik
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Błąd podczas wyświetlania obrazu:', error);
    res.status(500).json({ 
      success: false,
      message: 'Błąd serwera podczas wyświetlania obrazu' 
    });
  }
});

// Endpoint do listowania utworów - obsługuje GET i POST dla wyszukiwania
router.get('/list', async (req: Request, res: Response): Promise<void> => {
  try {
    // Sprawdź czy są parametry wyszukiwania w query string
    const searchQuery = req.query.search as string | undefined;
    
    // Podstawowe zapytanie z dodaną funkcją liczba_polubien
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
        a.kryptonim_artystyczny,
        liczba_polubien(u."ID_utworu") as likes_count
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
      likes_count: Number(utwor.likes_count),
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
        a.kryptonim_artystyczny,
        liczba_polubien(u."ID_utworu") as likes_count
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
      likes_count: Number(utwor.likes_count),
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
    
    // Usuń plik audio z dysku jeśli istnieje
    if (utwor.filepath && fs.existsSync(utwor.filepath)) {
      fs.unlinkSync(utwor.filepath);
    }
    
    // Usuń obraz z dysku jeśli istnieje
    if (utwor.imagePath && fs.existsSync(utwor.imagePath)) {
      fs.unlinkSync(utwor.imagePath);
    }
    
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

// Endpoint do aktualizacji danych utworu
router.put('/update/:utworId', async (req: Request<{utworId: string}>, res: Response): Promise<void> => {
  try {
    const { utworId } = req.params;
    const id = parseInt(utworId);
    const { nazwa_utworu, data_wydania, kryptonim_artystyczny } = req.body;
    
    // Sprawdź czy utwór istnieje
    const utworExists = await sql`
      SELECT "ID_utworu", "ID_autora" FROM "Utwor" 
      WHERE "ID_utworu" = ${id}
    `;
    
    if (utworExists.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Utwór nie istnieje'
      });
      return;
    }
    
    const utwor = utworExists[0];
    
    // Sprawdź czy autor istnieje lub stwórz nowego jeśli potrzeba
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
    
    // Aktualizuj utwór w bazie danych
    const updatedUtwor = await sql`
      UPDATE "Utwor" SET
        nazwa_utworu = ${nazwa_utworu},
        data_wydania = ${data_wydania},
        "ID_autora" = ${autorId}
      WHERE "ID_utworu" = ${id}
      RETURNING "ID_utworu", nazwa_utworu, data_wydania, "ID_autora"
    `;
    
    // Pobierz zaktualizowane informacje o autorze
    const autorInfo = await sql`
      SELECT imie, nazwisko, kryptonim_artystyczny
      FROM "Autorzy"
      WHERE "ID_autora" = ${autorId}
    `;
    
    res.status(200).json({
      success: true,
      message: 'Utwór zaktualizowany pomyślnie',
      utwor: {
        ...updatedUtwor[0],
        autor: autorInfo[0]
      }
    });
  } catch (error) {
    console.error('Błąd podczas aktualizacji utworu:', error);
    res.status(500).json({
      success: false,
      message: 'Błąd serwera podczas aktualizacji utworu',
      error: (error instanceof Error) ? error.message : 'Nieznany błąd'
    });
  }
});

// Endpoint do usuwania obrazu utworu
router.delete('/image/:utworId', async (req: Request<{utworId: string}>, res: Response): Promise<void> => {
  try {
    const { utworId } = req.params;
    const id = parseInt(utworId);
    
    // Pobierz informacje o obrazie z bazy danych
    const result = await sql`
      SELECT "imagePath", "imageFilename", "imageMimetype"
      FROM "Utwor"
      WHERE "ID_utworu" = ${id}
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
    if (utwor.imagePath && fs.existsSync(utwor.imagePath)) {
      fs.unlinkSync(utwor.imagePath);
    }
    
    // Wyczyść dane obrazu w bazie danych
    await sql`
      UPDATE "Utwor" SET
        "imageFilename" = NULL,
        "imagePath" = NULL,
        "imageMimetype" = NULL,
        "imageSize" = NULL
      WHERE "ID_utworu" = ${id}
    `;
    
    res.json({
      success: true,
      message: 'Obraz utworu został usunięty'
    });
  } catch (error) {
    console.error('Błąd podczas usuwania obrazu utworu:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Błąd serwera podczas usuwania obrazu utworu',
      error: (error instanceof Error) ? error.message : 'Nieznany błąd'  
    });
  }
});

export default router;