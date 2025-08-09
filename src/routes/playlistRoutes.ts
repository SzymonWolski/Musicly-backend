import { Request, Response, Router } from 'express';
import { sql } from 'bun';
import { authenticate } from '../middleware/authMiddleware';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

const router = Router();

// Apply authentication middleware to all playlist routes
router.use(authenticate);

// Konfiguracja multer dla przechowywania obrazów playlist
const playlistImageStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, '/app/uploads/playlist-images');
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const fileExt = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExt}`;
    cb(null, fileName);
  }
});

// Filtr plików - akceptowanie tylko obrazów
const imageFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Tylko pliki obrazów są dozwolone'));
  }
};

const playlistImageUpload = multer({ 
  storage: playlistImageStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // Limit 10MB dla obrazów
});

// Typowanie dla req.file
interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}

// Get all playlists - with optional filter for current user only
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { myOnly } = req.query; // Query parameter to filter only user's playlists

    let playlists;
    
    if (myOnly === 'true') {
      // Get only playlists created by the current user
      playlists = await sql`
        SELECT 
          p."ID_playlisty" as "id",
          p."nazwa_playlisty" as "name",
          p."imageFilename",
          p."imagePath",
          p."imageMimetype",
          p."imageSize",
          u."nick" as "createdBy",
          COUNT(pu."ID_utworu") as "songCount"
        FROM "Playlista" p
        JOIN "Uzytkownik" u ON p."ID_uzytkownik" = u."ID_uzytkownik"
        LEFT JOIN "PlaylistaUtwor" pu ON p."ID_playlisty" = pu."ID_playlisty"
        WHERE p."ID_uzytkownik" = ${userId}
        GROUP BY p."ID_playlisty", p."nazwa_playlisty", p."imageFilename", p."imagePath", p."imageMimetype", p."imageSize", u."nick"
        ORDER BY p."ID_playlisty"
      `;
    } else {
      // Get all playlists with creator's nick
      playlists = await sql`
        SELECT 
          p."ID_playlisty" as "id",
          p."nazwa_playlisty" as "name",
          p."imageFilename",
          p."imagePath",
          p."imageMimetype",
          p."imageSize",
          u."nick" as "createdBy",
          COUNT(pu."ID_utworu") as "songCount"
        FROM "Playlista" p
        JOIN "Uzytkownik" u ON p."ID_uzytkownik" = u."ID_uzytkownik"
        LEFT JOIN "PlaylistaUtwor" pu ON p."ID_playlisty" = pu."ID_playlisty"
        GROUP BY p."ID_playlisty", p."nazwa_playlisty", p."imageFilename", p."imagePath", p."imageMimetype", p."imageSize", u."nick"
        ORDER BY p."ID_playlisty"
      `;
    }
    
    res.status(200).json({ playlists });
    
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania playlist' });
  }
});

// Get a specific playlist with songs
router.get('/:playlistId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    // Get playlist details including image info and creator's nick
    const playlist = await sql`
      SELECT 
        p."ID_playlisty" as "id",
        p."nazwa_playlisty" as "name",
        p."imageFilename",
        p."imagePath",
        p."imageMimetype",
        p."imageSize",
        u."nick" as "createdBy",
        p."ID_uzytkownik" as "ownerId"
      FROM "Playlista" p
      JOIN "Uzytkownik" u ON p."ID_uzytkownik" = u."ID_uzytkownik"
      WHERE p."ID_playlisty" = ${playlistId}
    `;
    
    if (playlist.length === 0) {
      res.status(404).json({ error: 'Playlista nie istnieje' });
      return;
    }
    
    // Check if user has access to this playlist (owner or public access)
    const playlistData = playlist[0];
    const isOwner = playlistData.ownerId === userId;
    
    // For now, all playlists are accessible, but you can add privacy logic here
    
    // Get songs in the playlist, ordered by kolejnosc
    const songs = await sql`
      SELECT 
        u."ID_utworu" as "songId",
        u."nazwa_utworu" as "songName",
        u."data_wydania" as "releaseDate",
        a."kryptonim_artystyczny" as "artistName",
        pu."kolejnosc" as "order"
      FROM "PlaylistaUtwor" pu
      JOIN "Utwor" u ON pu."ID_utworu" = u."ID_utworu"
      JOIN "Autorzy" a ON u."ID_autora" = a."ID_autora"
      WHERE pu."ID_playlisty" = ${playlistId}
      ORDER BY pu."kolejnosc"
    `;
    
    res.status(200).json({ 
      playlist: {
        ...playlistData,
        isOwner
      },
      songs
    });
    
  } catch (error) {
    console.error('Error fetching playlist details:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania szczegółów playlisty' });
  }
});

// Create a new playlist
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { name } = req.body;
    
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Nazwa playlisty jest wymagana' });
      return;
    }
    
    // Get user's nick for response
    const user = await sql`
      SELECT "nick" FROM "Uzytkownik" WHERE "ID_uzytkownik" = ${userId}
    `;
    
    // Create the playlist
    const result = await sql`
      INSERT INTO "Playlista" ("ID_uzytkownik", "nazwa_playlisty")
      VALUES (${userId}, ${name})
      RETURNING "ID_playlisty" as "id"
    `;
    
    res.status(201).json({
      success: true,
      message: 'Playlista została utworzona',
      playlist: {
        id: result[0].id,
        name,
        createdBy: user[0].nick,
        songCount: 0,
        isOwner: true
      }
    });
    
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas tworzenia playlisty' });
  }
});

// Update a playlist name
router.put('/:playlistId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    const { name } = req.body;
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Nazwa playlisty jest wymagana' });
      return;
    }
    
    // Check if playlist exists and belongs to the user
    const playlist = await sql`
      SELECT "ID_playlisty" FROM "Playlista"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (playlist.length === 0) {
      res.status(404).json({ error: 'Playlista nie istnieje lub nie należy do ciebie' });
      return;
    }
    
    // Update playlist name
    await sql`
      UPDATE "Playlista"
      SET "nazwa_playlisty" = ${name}
      WHERE "ID_playlisty" = ${playlistId}
    `;
    
    res.status(200).json({
      success: true,
      message: 'Nazwa playlisty została zaktualizowana'
    });
    
  } catch (error) {
    console.error('Error updating playlist:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas aktualizacji playlisty' });
  }
});

// Endpoint do przesyłania obrazów playlist
router.post('/:playlistId/image', playlistImageUpload.single('image'), async (req: RequestWithFile, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);

    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'Nie przesłano pliku obrazu' });
      return;
    }

    // Check if playlist exists and belongs to the user
    const playlistExists = await sql`
      SELECT "ID_playlisty" FROM "Playlista"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (playlistExists.length === 0) {
      fs.unlinkSync(path.join('/app/uploads/playlist-images', req.file.filename));
      res.status(404).json({
        success: false,
        message: 'Playlista nie istnieje lub nie należy do ciebie'
      });
      return;
    }

    const tempFilePath = path.join('/app/uploads/playlist-images', req.file.filename);
    
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
      const finalFilePath = path.join('/app/uploads/playlist-images', finalFileName);
      
      await processedImage.jpeg({ quality: 90 }).toFile(finalFilePath);
      
      // Usuń oryginalny plik tymczasowy
      fs.unlinkSync(tempFilePath);

      // Pobierz informacje o starym obrazie (jeśli istnieje)
      const oldImageResult = await sql`
        SELECT "imageFilename", "imagePath" FROM "Playlista" 
        WHERE "ID_playlisty" = ${playlistId}
      `;

      // Usuń stary obraz jeśli istnieje
      if (oldImageResult[0]?.imagePath && fs.existsSync(oldImageResult[0].imagePath)) {
        fs.unlinkSync(oldImageResult[0].imagePath);
      }

      // Pobierz rozmiar nowego pliku
      const newFileStats = fs.statSync(finalFilePath);

      // Aktualizuj informacje o obrazie w bazie danych
      const updatedPlaylist = await sql`
        UPDATE "Playlista" SET
          "imageFilename" = ${finalFileName},
          "imagePath" = ${finalFilePath},
          "imageMimetype" = ${'image/jpeg'},
          "imageSize" = ${newFileStats.size}
        WHERE "ID_playlisty" = ${playlistId}
        RETURNING "ID_playlisty", "imageFilename", "imagePath", "imageMimetype", "imageSize"
      `;

      res.status(200).json({
        success: true,
        message: 'Obraz playlisty przesłany pomyślnie',
        image: updatedPlaylist[0]
      });

    } catch (processingError) {
      // Usuń plik w przypadku błędu przetwarzania
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      throw processingError;
    }

  } catch (error) {
    console.error('Błąd podczas przesyłania obrazu playlisty:', error);
    
    // Usuń plik w przypadku błędu
    if (req.file) {
      const filePath = path.join('/app/uploads/playlist-images', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Błąd serwera podczas przesyłania obrazu playlisty' 
    });
  }
});

// Endpoint do wyświetlania obrazów playlist
router.get('/:playlistId/image', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    // Check if playlist belongs to the user and get image info
    const result = await sql`
      SELECT "imagePath", "imageFilename", "imageMimetype"
      FROM "Playlista"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (result.length === 0) {
      res.status(404).json({ 
        success: false,
        message: 'Playlista nie istnieje lub nie należy do ciebie' 
      });
      return;
    }
    
    if (!result[0].imagePath) {
      res.status(404).json({ 
        success: false,
        message: 'Obraz playlisty nie istnieje' 
      });
      return;
    }
    
    const playlist = result[0];
    const filePath = playlist.imagePath;
    
    // Sprawdź czy plik istnieje
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ 
        success: false,
        message: 'Plik obrazu nie istnieje'
      });
      return;
    }
    
    // Pobierz statystyki pliku
    const stat = fs.statSync(filePath);
    
    // Ustaw odpowiednie nagłówki podobnie jak w fileRoutes i profileRoutes
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': playlist.imageMimetype || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000' // Cache na rok
    });
    
    // Wyślij plik
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Błąd podczas wyświetlania obrazu playlisty:', error);
    res.status(500).json({ 
      success: false,
      message: 'Błąd serwera podczas wyświetlania obrazu playlisty' 
    });
  }
});

// Endpoint do usuwania obrazu playlisty
router.delete('/:playlistId/image', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    // Check if playlist belongs to the user and get image info
    const result = await sql`
      SELECT "imagePath", "imageFilename", "imageMimetype"
      FROM "Playlista"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (result.length === 0) {
      res.status(404).json({ 
        success: false, 
        message: 'Playlista nie istnieje lub nie należy do ciebie' 
      });
      return;
    }
    
    const playlist = result[0];
    
    // Usuń plik z dysku jeśli istnieje
    if (playlist.imagePath && fs.existsSync(playlist.imagePath)) {
      fs.unlinkSync(playlist.imagePath);
    }
    
    // Wyczyść dane obrazu w bazie danych
    await sql`
      UPDATE "Playlista" SET
        "imageFilename" = NULL,
        "imagePath" = NULL,
        "imageMimetype" = NULL,
        "imageSize" = NULL
      WHERE "ID_playlisty" = ${playlistId}
    `;
    
    res.json({
      success: true,
      message: 'Obraz playlisty został usunięty'
    });
  } catch (error) {
    console.error('Błąd podczas usuwania obrazu playlisty:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Błąd serwera podczas usuwania obrazu playlisty',
      error: (error instanceof Error) ? error.message : 'Nieznany błąd'  
    });
  }
});

// Delete a playlist
router.delete('/:playlistId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    // Check if playlist exists and belongs to the user, get image info
    const playlist = await sql`
      SELECT "ID_playlisty", "imagePath" FROM "Playlista"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (playlist.length === 0) {
      res.status(404).json({ error: 'Playlista nie istnieje lub nie należy do ciebie' });
      return;
    }
    
    // Usuń obraz z dysku jeśli istnieje
    if (playlist[0].imagePath && fs.existsSync(playlist[0].imagePath)) {
      fs.unlinkSync(playlist[0].imagePath);
    }
    
    // Delete all playlist songs first (due to foreign key constraints)
    await sql`
      DELETE FROM "PlaylistaUtwor"
      WHERE "ID_playlisty" = ${playlistId}
    `;
    
    // Delete the playlist
    await sql`
      DELETE FROM "Playlista"
      WHERE "ID_playlisty" = ${playlistId}
    `;
    
    res.status(200).json({
      success: true,
      message: 'Playlista została usunięta'
    });
    
  } catch (error) {
    console.error('Error deleting playlist:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas usuwania playlisty' });
  }
});

// Add a song to the playlist
router.post('/:playlistId/songs', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    const { songId } = req.body;
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    if (!songId) {
      res.status(400).json({ error: 'ID utworu jest wymagane' });
      return;
    }
    
    // Check if playlist exists and belongs to the user
    const playlist = await sql`
      SELECT "ID_playlisty" FROM "Playlista"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (playlist.length === 0) {
      res.status(404).json({ error: 'Playlista nie istnieje lub nie należy do ciebie' });
      return;
    }
    
    // Check if song exists
    const song = await sql`
      SELECT "ID_utworu" FROM "Utwor"
      WHERE "ID_utworu" = ${Number(songId)}
    `;
    
    if (song.length === 0) {
      res.status(404).json({ error: 'Utwór nie istnieje' });
      return;
    }
    
    // Check if the song is already in the playlist
    const existingSong = await sql`
      SELECT "ID_utworu" FROM "PlaylistaUtwor"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_utworu" = ${Number(songId)}
    `;
    
    if (existingSong.length > 0) {
      res.status(409).json({ error: 'Utwór jest już w playliście' });
      return;
    }
    
    // Get the highest kolejnosc in the playlist
    const order = await sql`
      SELECT MAX("kolejnosc") as "max_order" FROM "PlaylistaUtwor"
      WHERE "ID_playlisty" = ${playlistId}
    `;
    
    // If this is the first song, set kolejnosc to 1, otherwise increment the highest value
    const nextOrder = order[0].max_order ? Number(order[0].max_order) + 1 : 1;
    
    // Add the song to the playlist
    await sql`
      INSERT INTO "PlaylistaUtwor" ("ID_playlisty", "ID_utworu", "kolejnosc")
      VALUES (${playlistId}, ${Number(songId)}, ${nextOrder})
    `;
    
    res.status(201).json({
      success: true,
      message: 'Utwór dodany do playlisty',
      data: {
        playlistId,
        songId: Number(songId),
        order: nextOrder
      }
    });
    
  } catch (error) {
    console.error('Error adding song to playlist:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas dodawania utworu do playlisty' });
  }
});

// Remove a song from the playlist
router.delete('/:playlistId/songs/:songId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    const songId = Number(req.params.songId);
    
    if (isNaN(playlistId) || isNaN(songId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty lub utworu' });
      return;
    }
    
    // Check if playlist exists and belongs to the user
    const playlist = await sql`
      SELECT "ID_playlisty" FROM "Playlista"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (playlist.length === 0) {
      res.status(404).json({ error: 'Playlista nie istnieje lub nie należy do ciebie' });
      return;
    }
    
    // Get the kolejnosc of the song to be removed
    const songToRemove = await sql`
      SELECT "kolejnosc" FROM "PlaylistaUtwor"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_utworu" = ${songId}
    `;
    
    if (songToRemove.length === 0) {
      res.status(404).json({ error: 'Utwór nie znajduje się w tej playliście' });
      return;
    }
    
    const removedOrder = Number(songToRemove[0].kolejnosc);
    
    // Remove the song from the playlist
    await sql`
      DELETE FROM "PlaylistaUtwor"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_utworu" = ${songId}
    `;
    
    // Update kolejnosc for songs that came after the removed one
    await sql`
      UPDATE "PlaylistaUtwor"
      SET "kolejnosc" = "kolejnosc" - 1
      WHERE "ID_playlisty" = ${playlistId} AND "kolejnosc" > ${removedOrder}
    `;
    
    res.status(200).json({
      success: true,
      message: 'Utwór usunięty z playlisty'
    });
    
  } catch (error) {
    console.error('Error removing song from playlist:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas usuwania utworu z playlisty' });
  }
});

// Update the order of songs in a playlist
router.put('/:playlistId/order', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    const { songOrder } = req.body;
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    if (!songOrder || !Array.isArray(songOrder)) {
      res.status(400).json({ error: 'Lista porządkowa utworów jest wymagana' });
      return;
    }
    
    // Check if playlist exists and belongs to the user
    const playlist = await sql`
      SELECT "ID_playlisty" FROM "Playlista"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (playlist.length === 0) {
      res.status(404).json({ error: 'Playlista nie istnieje lub nie należy do ciebie' });
      return;
    }
    
    // Update the order of songs in the playlist
    for (let i = 0; i < songOrder.length; i++) {
      await sql`
        UPDATE "PlaylistaUtwor"
        SET "kolejnosc" = ${i + 1}
        WHERE "ID_playlisty" = ${playlistId} AND "ID_utworu" = ${songOrder[i]}
      `;
    }
    
    res.status(200).json({
      success: true,
      message: 'Kolejność utworów zaktualizowana'
    });
    
  } catch (error) {
    console.error('Error updating song order:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas aktualizacji kolejności utworów' });
  }
});

// Get all songs in a specific playlist
router.get('/:playlistId/songs', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    // Check if playlist exists and get owner info
    const playlist = await sql`
      SELECT 
        p."ID_playlisty",
        p."ID_uzytkownik" as "ownerId",
        u."nick" as "createdBy"
      FROM "Playlista" p
      JOIN "Uzytkownik" u ON p."ID_uzytkownik" = u."ID_uzytkownik"
      WHERE p."ID_playlisty" = ${playlistId}
    `;
    
    if (playlist.length === 0) {
      res.status(404).json({ error: 'Playlista nie istnieje' });
      return;
    }
    
    // Get songs in the playlist with the exact structure needed by frontend
    const songs = await sql`
      SELECT 
        u."ID_utworu",
        u."nazwa_utworu",
        u."data_wydania",
        json_build_object(
          'imie', a."imie",
          'nazwisko', a."nazwisko",
          'kryptonim_artystyczny', a."kryptonim_artystyczny"
        ) as "Autor"
      FROM "PlaylistaUtwor" pu
      JOIN "Utwor" u ON pu."ID_utworu" = u."ID_utworu"
      JOIN "Autorzy" a ON u."ID_autora" = a."ID_autora"
      WHERE pu."ID_playlisty" = ${playlistId}
      ORDER BY pu."kolejnosc"
    `;
    
    res.status(200).json({ 
      songs,
      playlistInfo: {
        createdBy: playlist[0].createdBy,
        isOwner: playlist[0].ownerId === userId
      }
    });
    
  } catch (error) {
    console.error('Error fetching playlist songs:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania utworów z playlisty' });
  }
});

export default router;
