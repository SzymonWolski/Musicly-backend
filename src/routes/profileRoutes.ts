import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// Konfiguracja multer dla zdjęć profilowych
const profileImageStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, '/app/uploads/user-images');
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    // Generowanie unikalnej nazwy pliku z zachowaniem oryginalnego rozszerzenia
    const fileExt = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExt}`;
    cb(null, fileName);
  }
});

// Filtr plików - akceptowanie tylko plików obrazów
const imageFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Sprawdź czy plik jest obrazem
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Tylko pliki obrazów są dozwolone'));
  }
};

const uploadProfileImage = multer({ 
  storage: profileImageStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 20 * 1024 * 1024 } // Limit 20MB dla zdjęć
});

// Typowanie dla req.file
interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}

// Endpoint do przesyłania zdjęcia profilowego
router.post('/upload-profile-image', uploadProfileImage.single('profileImage'), async (req: RequestWithFile, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'Nie przesłano pliku obrazu' });
      return;
    }

    // Sprawdź czy użytkownik jest zalogowany (userId powinien być przekazany w body lub z tokena)
    const { userId } = req.body;
    
    if (!userId) {
      // Usuń plik jeśli nie ma userId
      fs.unlinkSync(path.join('/app/uploads/user-images', req.file.filename));
      res.status(400).json({ success: false, message: 'Brak identyfikatora użytkownika' });
      return;
    }
    
    // Sprawdź czy użytkownik istnieje
    const user = await prisma.uzytkownik.findUnique({
      where: { ID_uzytkownik: parseInt(userId) },
      select: {
        ID_uzytkownik: true,
        profileImagePath: true,
        profileImageFilename: true
      }
    });
    
    if (!user) {
      // Usuń plik jeśli użytkownik nie istnieje
      fs.unlinkSync(path.join('/app/uploads/user-images', req.file.filename));
      res.status(404).json({ success: false, message: 'Użytkownik nie istnieje' });
      return;
    }
    
    // Usuń stare zdjęcie profilowe jeśli istnieje, nie jest domyślnym i ma filename
    if (user.profileImagePath && 
        user.profileImageFilename && 
        user.profileImagePath !== '/uploads/user-images/default-profile.jpg' &&
        user.profileImageFilename !== 'default-profile.jpg') {
      const oldImagePath = path.join('/app/uploads/user-images', user.profileImageFilename);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    // Zapisz informacje o nowym zdjęciu profilowym w bazie danych
    const updatedUser = await prisma.uzytkownik.update({
      where: { ID_uzytkownik: parseInt(userId) },
      data: {
        profileImageFilename: req.file.filename,
        profileImagePath: `/uploads/user-images/${req.file.filename}`,
        profileImageMimetype: req.file.mimetype,
        profileImageSize: req.file.size
      },
      select: {
        ID_uzytkownik: true,
        nick: true,
        profileImagePath: true
      }
    });
    
    // Zwracamy informacje o przesłanym zdjęciu
    res.status(200).json({
      success: true,
      message: 'Zdjęcie profilowe przesłane pomyślnie',
      user: {
        id: updatedUser.ID_uzytkownik,
        nick: updatedUser.nick,
        profileImagePath: updatedUser.profileImagePath
      }
    });
  } catch (error) {
    console.error('Błąd podczas przesyłania zdjęcia profilowego:', error);
    
    // Usuń plik w przypadku błędu
    if (req.file) {
      fs.unlinkSync(path.join('/app/uploads/user-images', req.file.filename));
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Błąd serwera podczas przesyłania zdjęcia profilowego' 
    });
  }
});

// Endpoint do wyświetlania zdjęć profilowych
router.get('/profile-image/:userId', async (req: Request<{userId: string}>, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const id = parseInt(userId);
    
    // Pobierz informacje o zdjęciu profilowym z bazy danych
    const user = await prisma.uzytkownik.findUnique({
      where: { ID_uzytkownik: id },
      select: {
        profileImagePath: true,
        profileImageFilename: true,
        profileImageMimetype: true
      }
    });
    
    if (!user) {
      res.status(404).json({ 
        success: false,
        message: 'Użytkownik nie istnieje' 
      });
      return;
    }
    
    let filePath;
    let mimeType = 'image/jpeg'; // Domyślny typ MIME dla default-profile.jpg
    
    // Jeśli użytkownik nie ma zdjęcia profilowego, użyj domyślnego
    if (!user.profileImagePath || !user.profileImageFilename) {
      filePath = '/app/uploads/user-images/default-profile.jpg';
    } else {
      filePath = path.join('/app', user.profileImagePath);
      mimeType = user.profileImageMimetype || 'image/jpeg';
    }
    
    // Sprawdzamy, czy plik istnieje
    if (!fs.existsSync(filePath)) {
      // Jeśli nie istnieje, użyj domyślnego zdjęcia
      filePath = '/app/uploads/user-images/default-profile.jpg';
      mimeType = 'image/jpeg';
      
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ 
          success: false,
          message: 'Domyślne zdjęcie profilowe nie istnieje'
        });
        return;
      }
    }
    
    // Pobierz statystyki pliku
    const stat = fs.statSync(filePath);
    
    // Wyślij zdjęcie
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=3600' // Cache na 1 godzinę
    });
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Błąd podczas wyświetlania zdjęcia profilowego:', error);
    res.status(500).json({ 
      success: false,
      message: 'Błąd serwera podczas wyświetlania zdjęcia profilowego' 
    });
  }
});

// Endpoint do usuwania zdjęcia profilowego
router.delete('/profile-image/:userId', async (req: Request<{userId: string}>, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const id = parseInt(userId);
    
    // Pobierz informacje o użytkowniku
    const user = await prisma.uzytkownik.findUnique({
      where: { ID_uzytkownik: id },
      select: {
        ID_uzytkownik: true,
        profileImagePath: true,
        nick: true
      }
    });
    
    if (!user) {
      res.status(404).json({ 
        success: false, 
        message: 'Użytkownik nie istnieje' 
      });
      return;
    }
    
    // Usuń plik z dysku jeśli istnieje i nie jest domyślnym
    if (user.profileImagePath && user.profileImagePath !== '/uploads/user-images/default-profile.jpg') {
      const imagePath = path.join('/app', user.profileImagePath);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    // Wyczyść dane zdjęcia profilowego w bazie danych
    await prisma.uzytkownik.update({
      where: { ID_uzytkownik: id },
      data: {
        profileImageFilename: null,
        profileImagePath: null,
        profileImageMimetype: null,
        profileImageSize: null
      }
    });
    
    res.json({
      success: true,
      message: 'Zdjęcie profilowe zostało usunięte',
      user: {
        id: user.ID_uzytkownik,
        nick: user.nick,
        profileImagePath: '/uploads/user-images/default-profile.jpg'
      }
    });
  } catch (error) {
    console.error('Błąd podczas usuwania zdjęcia profilowego:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Błąd serwera podczas usuwania zdjęcia profilowego',
      error: (error instanceof Error) ? error.message : 'Nieznany błąd'  
    });
  }
});

export default router;