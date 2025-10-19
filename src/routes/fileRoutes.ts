import { Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import * as musicMetadata from 'music-metadata';
import sharp from 'sharp';

const prisma = new PrismaClient();
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
    let autor = await prisma.autorzy.findFirst({
      where: {
        kryptonim_artystyczny: kryptonim_artystyczny
      }
    });
    
    // Jeśli autor nie istnieje, stwórz nowego
    if (!autor) {
      autor = await prisma.autorzy.create({
        data: {
          imie: '',
          nazwisko: '',
          kryptonim_artystyczny
        }
      });
    }

    // Pobierz czas trwania pliku audio automatycznie
    const filePath = path.join('/app/uploads/songs', req.file.filename);
    const metadata = await musicMetadata.parseFile(filePath);

    // Zapisz informacje o utworze w bazie danych
    const utwor = await prisma.utwor.create({
      data: {
        nazwa_utworu: nazwa_utworu || '',
        data_wydania: data_wydania || '',
        ID_autora: autor.ID_autora,
        filename: req.file.filename || null,
        filepath: `/app/uploads/songs/${req.file.filename}` || null,
        mimetype: req.file.mimetype || null,
        filesize: req.file.size || null
      },
      include: {
        Autor: true
      }
    });
    
    // Zwracamy informacje o przesłanym utworu wraz z informacją o autorze
    res.status(200).json({
      success: true,
      message: 'Utwór przesłany pomyślnie',
      utwor: {
        ...utwor,
        autor: {
          imie: utwor.Autor.imie,
          nazwisko: utwor.Autor.nazwisko,
          kryptonim_artystyczny: utwor.Autor.kryptonim_artystyczny
        }
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
    const utworExists = await prisma.utwor.findUnique({
      where: { ID_utworu: id }
    });
    
    if (!utworExists) {
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
      if (utworExists.imagePath && fs.existsSync(utworExists.imagePath)) {
        fs.unlinkSync(utworExists.imagePath);
      }

      // Pobierz rozmiar nowego pliku
      const newFileStats = fs.statSync(finalFilePath);

      // Aktualizuj informacje o obrazie w bazie danych
      const updatedUtwor = await prisma.utwor.update({
        where: { ID_utworu: id },
        data: {
          imageFilename: finalFileName,
          imagePath: finalFilePath,
          imageMimetype: 'image/jpeg',
          imageSize: newFileStats.size
        },
        select: {
          ID_utworu: true,
          imageFilename: true, 
          imagePath: true, 
          imageMimetype: true, 
          imageSize: true
        }
      });

      res.status(200).json({
        success: true,
        message: 'Obraz utworu przesłany pomyślnie',
        image: updatedUtwor
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
    const utwor = await prisma.utwor.findUnique({
      where: { ID_utworu: id },
      select: {
        imagePath: true,
        imageFilename: true,
        imageMimetype: true
      }
    });
    
    if (!utwor || !utwor.imagePath) {
      res.status(404).json({ 
        success: false,
        message: 'Obraz utworu nie istnieje' 
      });
      return;
    }
    
    const filePath = utwor.imagePath;
    
    // Sprawdź czy plik istnieje
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ 
        success: false,
        message: 'Plik obrazu nie istnieje'
      });
      return;
    }
    
    // Ustaw odpowiednie nagłówki
    res.setHeader('Content-Type', utwor.imageMimetype || 'image/jpeg');
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
    
    // Pobierz utwory z bazy danych
    const utwory = await prisma.utwor.findMany({
      where: searchQuery ? {
        OR: [
          { nazwa_utworu: { contains: searchQuery, mode: 'insensitive' } },
          { Autor: { kryptonim_artystyczny: { contains: searchQuery, mode: 'insensitive' } } }
        ]
      } : {},
      include: {
        Autor: {
          select: {
            imie: true,
            nazwisko: true,
            kryptonim_artystyczny: true
          }
        },
        Polubienia: {
          select: {
            data_polubienia: true
          }
        }
      },
      orderBy: {
        ID_utworu: 'desc'
      }
    });
    
    // Przekształć wyniki do oczekiwanego formatu
    const formattedUtwory = utwory.map((utwor) => ({
      ID_utworu: utwor.ID_utworu,
      nazwa_utworu: utwor.nazwa_utworu,
      data_wydania: utwor.data_wydania,
      filename: utwor.filename,
      mimetype: utwor.mimetype,
      filesize: utwor.filesize,
      likes_count: utwor.Polubienia.length,
      Autor: {
        imie: utwor.Autor.imie,
        nazwisko: utwor.Autor.nazwisko,
        kryptonim_artystyczny: utwor.Autor.kryptonim_artystyczny
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
    
    const utwory = await prisma.utwor.findMany({
      where: searchQuery && searchQuery.trim() !== '' ? {
        OR: [
          { nazwa_utworu: { contains: searchQuery, mode: 'insensitive' } },
          { Autor: { kryptonim_artystyczny: { contains: searchQuery, mode: 'insensitive' } } }
        ]
      } : {},
      include: {
        Autor: {
          select: {
            imie: true,
            nazwisko: true,
            kryptonim_artystyczny: true
          }
        },
        Polubienia: {
          select: {
            data_polubienia: true
          }
        }
      },
      orderBy: {
        ID_utworu: 'desc'
      }
    });
    
    const formattedUtwory = utwory.map((utwor) => ({
      ID_utworu: utwor.ID_utworu,
      nazwa_utworu: utwor.nazwa_utworu,
      data_wydania: utwor.data_wydania,
      filename: utwor.filename,
      mimetype: utwor.mimetype,
      filesize: utwor.filesize,
      likes_count: utwor.Polubienia.length,
      Autor: {
        imie: utwor.Autor.imie,
        nazwisko: utwor.Autor.nazwisko,
        kryptonim_artystyczny: utwor.Autor.kryptonim_artystyczny
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
    const utwor = await prisma.utwor.findUnique({
      where: { ID_utworu: id },
      include: {
        Autor: {
          select: {
            imie: true,
            nazwisko: true,
            kryptonim_artystyczny: true
          }
        }
      }
    });
    
    if (!utwor) {
      res.status(404).json({ 
        success: false, 
        message: 'Utwór nie istnieje' 
      });
      return;
    }
    
    // Usuń plik audio z dysku jeśli istnieje
    if (utwor.filepath && fs.existsSync(utwor.filepath)) {
      fs.unlinkSync(utwor.filepath);
    }
    
    // Usuń obraz z dysku jeśli istnieje
    if (utwor.imagePath && fs.existsSync(utwor.imagePath)) {
      fs.unlinkSync(utwor.imagePath);
    }
    
    // Wykonaj wszystkie operacje usuwania w transakcji
    await prisma.$transaction(async (tx) => {
      // Usuń numeracje utworu
      await tx.numeracja_utworu.deleteMany({
        where: { ID_utworu: id }
      });
      
      // Usuń powiązania z playlistami
      await tx.playlistaUtwor.deleteMany({
        where: { ID_utworu: id }
      });
      
      // Usuń polubienia
      await tx.polubienia.deleteMany({
        where: { ID_piosenki: id }
      });
      
      // Na koniec usuń sam utwór
      await tx.utwor.delete({
        where: { ID_utworu: id }
      });
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
          imie: utwor.Autor.imie,
          nazwisko: utwor.Autor.nazwisko,
          kryptonim_artystyczny: utwor.Autor.kryptonim_artystyczny
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
    const utwor = await prisma.utwor.findUnique({
      where: { ID_utworu: id },
      select: {
        filepath: true,
        filename: true,
        mimetype: true
      }
    });
    
    if (!utwor || !utwor.filepath) {
      res.status(404).json({ 
        success: false,
        message: 'Utwór nie istnieje lub nie ma powiązanego pliku' 
      });
      return;
    }
    
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
    const utworExists = await prisma.utwor.findUnique({
      where: { ID_utworu: id },
      select: { ID_utworu: true }
    });
    
    if (!utworExists) {
      res.status(404).json({
        success: false,
        message: 'Utwór nie istnieje'
      });
      return;
    }
    
    // Sprawdź czy autor istnieje lub stwórz nowego jeśli potrzeba
    let autor = await prisma.autorzy.findFirst({
      where: { kryptonim_artystyczny }
    });
    
    if (!autor) {
      // Autor nie istnieje, stwórz nowego
      autor = await prisma.autorzy.create({
        data: {
          imie: '',
          nazwisko: '',
          kryptonim_artystyczny
        }
      });
    }
    
    // Aktualizuj utwór w bazie danych
    const updatedUtwor = await prisma.utwor.update({
      where: { ID_utworu: id },
      data: {
        nazwa_utworu,
        data_wydania,
        ID_autora: autor.ID_autora
      },
      include: {
        Autor: true
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Utwór zaktualizowany pomyślnie',
      utwor: {
        ...updatedUtwor,
        autor: {
          imie: updatedUtwor.Autor.imie,
          nazwisko: updatedUtwor.Autor.nazwisko,
          kryptonim_artystyczny: updatedUtwor.Autor.kryptonim_artystyczny
        }
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
    const utwor = await prisma.utwor.findUnique({
      where: { ID_utworu: id },
      select: {
        imagePath: true
      }
    });
    
    if (!utwor) {
      res.status(404).json({ 
        success: false, 
        message: 'Utwór nie istnieje' 
      });
      return;
    }
    
    // Usuń plik z dysku jeśli istnieje
    if (utwor.imagePath && fs.existsSync(utwor.imagePath)) {
      fs.unlinkSync(utwor.imagePath);
    }
    
    // Wyczyść dane obrazu w bazie danych
    await prisma.utwor.update({
      where: { ID_utworu: id },
      data: {
        imageFilename: null,
        imagePath: null,
        imageMimetype: null,
        imageSize: null
      }
    });
    
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