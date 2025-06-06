import { Request, Response, Router } from 'express';
import { sql } from 'bun';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Apply authentication middleware to all playlist routes
router.use(authenticate);

// Get all playlists for the current user
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;

    // Get all playlists for the user with song count
    const playlists = await sql`
      SELECT 
        p."ID_playlisty" as "id",
        p."nazwa_playlisty" as "name",
        COUNT(pu."ID_utworu") as "songCount"
      FROM "Playlista" p
      LEFT JOIN "PlaylistaUtwor" pu ON p."ID_playlisty" = pu."ID_playlisty"
      WHERE p."ID_uzytkownik" = ${userId}
      GROUP BY p."ID_playlisty", p."nazwa_playlisty"
      ORDER BY p."ID_playlisty"
    `;
    
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
    
    // Get playlist details
    const playlist = await sql`
      SELECT 
        p."ID_playlisty" as "id",
        p."nazwa_playlisty" as "name"
      FROM "Playlista" p
      WHERE p."ID_playlisty" = ${playlistId} AND p."ID_uzytkownik" = ${userId}
    `;
    
    if (playlist.length === 0) {
      res.status(404).json({ error: 'Playlista nie istnieje lub nie należy do ciebie' });
      return;
    }
    
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
      playlist: playlist[0],
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
        songCount: 0
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

// Delete a playlist
router.delete('/:playlistId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
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
    
    // Check if playlist exists and belongs to the user
    const playlist = await sql`
      SELECT "ID_playlisty" FROM "Playlista"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (playlist.length === 0) {
      res.status(404).json({ error: 'Playlista nie istnieje lub nie należy do ciebie' });
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
    
    res.status(200).json({ songs });
    
  } catch (error) {
    console.error('Error fetching playlist songs:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania utworów z playlisty' });
  }
});

export default router;
