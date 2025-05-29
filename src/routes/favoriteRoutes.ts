import { Request, Response, Router } from 'express';
import { sql } from 'bun';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Apply authentication middleware to all favorite routes
router.use(authenticate);

// Get all favorites for the current user
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;

    // Get all favorite songs for the user
    const favorites = await sql`
      SELECT 
        p."ID_piosenki" as "songId",
        p."data_polubienia" as "likedAt",
        u."nazwa_utworu" as "songName",
        a."kryptonim_artystyczny" as "artistName"
      FROM "Polubienia" p
      JOIN "Utwor" u ON p."ID_piosenki" = u."ID_utworu"
      JOIN "Autorzy" a ON u."ID_autora" = a."ID_autora"
      WHERE p."ID_uzytkownik" = ${userId}
      ORDER BY p."data_polubienia" DESC
    `;
    
    res.status(200).json({ favorites });
    
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania ulubionych' });
  }
});

// Add a song to favorites
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { songId } = req.body;
    
    if (!songId) {
      res.status(400).json({ error: 'ID utworu jest wymagane' });
      return;
    }
    
    // Check if the song exists
    const song = await sql`
      SELECT "ID_utworu" FROM "Utwor"
      WHERE "ID_utworu" = ${Number(songId)}
    `;
    
    if (song.length === 0) {
      res.status(404).json({ error: 'Utwór nie istnieje' });
      return;
    }
    
    // Check if the song is already in favorites
    const existingFavorite = await sql`
      SELECT "ID_piosenki" FROM "Polubienia"
      WHERE "ID_piosenki" = ${Number(songId)} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (existingFavorite.length > 0) {
      res.status(409).json({ error: 'Utwór jest już w ulubionych' });
      return;
    }
    
    // Get the current date/time in ISO string format
    const currentDate = new Date().toISOString();
    
    // Add the song to favorites
    await sql`
      INSERT INTO "Polubienia" ("ID_piosenki", "ID_uzytkownik", "data_polubienia")
      VALUES (${Number(songId)}, ${userId}, ${currentDate})
    `;
    
    res.status(201).json({ 
      success: true,
      message: 'Utwór dodany do ulubionych',
      data: {
        songId: Number(songId),
        userId: userId,
        likedAt: currentDate
      }
    });
    
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas dodawania ulubionego' });
  }
});

// Remove a song from favorites
router.delete('/:songId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const songId = Number(req.params.songId);
    
    if (isNaN(songId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID utworu' });
      return;
    }
    
    // Check if the favorite exists
    const favorite = await sql`
      SELECT "ID_piosenki" FROM "Polubienia"
      WHERE "ID_piosenki" = ${songId} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (favorite.length === 0) {
      res.status(404).json({ error: 'Utwór nie jest w ulubionych' });
      return;
    }
    
    // Remove the song from favorites
    await sql`
      DELETE FROM "Polubienia"
      WHERE "ID_piosenki" = ${songId} AND "ID_uzytkownik" = ${userId}
    `;
    
    res.status(200).json({
      success: true,
      message: 'Utwór usunięty z ulubionych'
    });
    
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas usuwania ulubionego' });
  }
});

export default router;
