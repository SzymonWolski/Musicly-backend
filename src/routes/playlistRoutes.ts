import { Request, Response, Router } from 'express';
import { sql } from 'bun';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

const router = Router();

// Typowanie dla req.file
interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}

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

// Get all playlists - with optional filter for current user only
router.get('/', optionalAuthenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId; // This may be undefined for non-authenticated users
    const { myOnly } = req.query; // Query parameter to filter only user's playlists

    // If myOnly is true but user is not logged in, return error
    if (myOnly === 'true' && !userId) {
      res.status(401).json({ error: 'Authentication required to view your playlists' });
      return;
    }

    let playlists;
    
    if (myOnly === 'true' && userId) {
      // Get only playlists created by the current user
      playlists = await sql`
        SELECT 
          p."ID_playlisty" as "id",
          p."nazwa_playlisty" as "name",
          p."imageFilename",
          p."imagePath",
          p."imageMimetype",
          p."imageSize",
          p."isPrivate",
          p."allowFriendsAccess",
          u."nick" as "createdBy",
          COUNT(DISTINCT pu."ID_utworu") as "songCount",
          COUNT(DISTINCT pp."ID_uzytkownik") as "likeCount",
          CASE WHEN pp_current."ID_playlisty" IS NOT NULL THEN true ELSE false END as "isFavorite"
        FROM "Playlista" p
        JOIN "Uzytkownik" u ON p."ID_uzytkownik" = u."ID_uzytkownik"
        LEFT JOIN "PlaylistaUtwor" pu ON p."ID_playlisty" = pu."ID_playlisty"
        LEFT JOIN "PolubieniaPlaylist" pp ON p."ID_playlisty" = pp."ID_playlisty"
        LEFT JOIN "PolubieniaPlaylist" pp_current ON p."ID_playlisty" = pp_current."ID_playlisty" AND pp_current."ID_uzytkownik" = ${userId}
        WHERE p."ID_uzytkownik" = ${userId}
        GROUP BY p."ID_playlisty", p."nazwa_playlisty", p."imageFilename", p."imagePath", p."imageMimetype", p."imageSize", p."isPrivate", p."allowFriendsAccess", u."nick", pp_current."ID_playlisty"
        ORDER BY p."ID_playlisty"
      `;
    } else {
      // Get all playlists with creator's nick, like count and favorite status (if logged in)
      if (userId) {
        playlists = await sql`
          SELECT 
            p."ID_playlisty" as "id",
            p."nazwa_playlisty" as "name",
            p."imageFilename",
            p."imagePath",
            p."imageMimetype",
            p."imageSize",
            p."isPrivate",
            p."allowFriendsAccess",
            u."nick" as "createdBy",
            COUNT(DISTINCT pu."ID_utworu") as "songCount",
            COUNT(DISTINCT pp."ID_uzytkownik") as "likeCount",
            CASE WHEN pp_current."ID_playlisty" IS NOT NULL THEN true ELSE false END as "isFavorite"
          FROM "Playlista" p
          JOIN "Uzytkownik" u ON p."ID_uzytkownik" = u."ID_uzytkownik"
          LEFT JOIN "PlaylistaUtwor" pu ON p."ID_playlisty" = pu."ID_playlisty"
          LEFT JOIN "PolubieniaPlaylist" pp ON p."ID_playlisty" = pp."ID_playlisty"
          LEFT JOIN "PolubieniaPlaylist" pp_current ON p."ID_playlisty" = pp_current."ID_playlisty" AND pp_current."ID_uzytkownik" = ${userId}
          LEFT JOIN "Znajomi" f1 ON (p."ID_uzytkownika" = f1."ID_uzytkownik1" AND f1."ID_uzytkownik2" = ${userId} AND f1."status" = 'accepted')
          LEFT JOIN "Znajomi" f2 ON (p."ID_uzytkownika" = f2."ID_uzytkownik2" AND f2."ID_uzytkownik1" = ${userId} AND f2."status" = 'accepted')
          LEFT JOIN "PlaylistaDostep" pd ON (p."ID_playlisty" = pd."ID_playlisty" AND pd."ID_uzytkownik" = ${userId})
          WHERE 
            (p."isPrivate" = false) OR 
            (p."ID_uzytkownik" = ${userId}) OR
            (p."isPrivate" = true AND pd."ID_playlisty" IS NOT NULL) OR
            (p."isPrivate" = true AND p."allowFriendsAccess" = true AND (f1."ID_uzytkownik1" IS NOT NULL OR f2."ID_uzytkownik2" IS NOT NULL))
          GROUP BY p."ID_playlisty", p."nazwa_playlisty", p."imageFilename", p."imagePath", p."imageMimetype", p."imageSize", p."isPrivate", p."allowFriendsAccess", u."nick", pp_current."ID_playlisty"
          ORDER BY p."ID_playlisty"
        `;
      } else {
        // For non-authenticated users - show only public playlists
        playlists = await sql`
          SELECT 
            p."ID_playlisty" as "id",
            p."nazwa_playlisty" as "name",
            p."imageFilename",
            p."imagePath",
            p."imageMimetype",
            p."imageSize",
            p."isPrivate",
            p."allowFriendsAccess",
            u."nick" as "createdBy",
            COUNT(DISTINCT pu."ID_utworu") as "songCount",
            COUNT(DISTINCT pp."ID_uzytkownik") as "likeCount",
            false as "isFavorite"
          FROM "Playlista" p
          JOIN "Uzytkownik" u ON p."ID_uzytkownik" = u."ID_uzytkownik"
          LEFT JOIN "PlaylistaUtwor" pu ON p."ID_playlisty" = pu."ID_playlisty"
          LEFT JOIN "PolubieniaPlaylist" pp ON p."ID_playlisty" = pp."ID_playlisty"
          WHERE p."isPrivate" = false
          GROUP BY p."ID_playlisty", p."nazwa_playlisty", p."imageFilename", p."imagePath", p."imageMimetype", p."imageSize", p."isPrivate", p."allowFriendsAccess", u."nick"
          ORDER BY p."ID_playlisty"
        `;
      }
    }
    
    res.status(200).json({ playlists });
    
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania playlist' });
  }
});

// Get a specific playlist with songs
router.get('/:playlistId', optionalAuthenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId; // May be undefined for non-authenticated users
    const playlistId = Number(req.params.playlistId);
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    // Get basic playlist details first to check privacy settings
    const playlistBasic = await sql`
      SELECT 
        p."ID_playlisty",
        p."ID_uzytkownik" as "ownerId", 
        p."isPrivate",
        p."allowFriendsAccess"
      FROM "Playlista" p
      WHERE p."ID_playlisty" = ${playlistId}
    `;
    
    if (playlistBasic.length === 0) {
      res.status(404).json({ error: 'Playlista nie istnieje' });
      return;
    }
    
    const playlist = playlistBasic[0];
    
    // Check access to private playlist
    if (playlist.isPrivate === true) {
      if (!userId) {
        // Non-authenticated user cannot access private playlist
        res.status(403).json({ error: 'Brak dostępu do prywatnej playlisty' });
        return;
      }
      
      if (playlist.ownerId !== userId) {
        // Check if user has explicit access
        const hasAccess = await sql`
          SELECT "ID_dostep" FROM "PlaylistaDostep"
          WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
        `;
        
        if (hasAccess.length === 0 && playlist.allowFriendsAccess === true) {
          // Check if user is a friend of the owner
          const isFriend = await sql`
            SELECT "ID_znajomych" FROM "Znajomi"
            WHERE (("ID_uzytkownik1" = ${playlist.ownerId} AND "ID_uzytkownik2" = ${userId}) OR
                  ("ID_uzytkownik1" = ${userId} AND "ID_uzytkownik2" = ${playlist.ownerId}))
            AND "status" = 'accepted'
          `;
          
          if (isFriend.length === 0) {
            res.status(403).json({ error: 'Brak dostępu do prywatnej playlisty' });
            return;
          }
        } else if (hasAccess.length === 0) {
          res.status(403).json({ error: 'Brak dostępu do prywatnej playlisty' });
          return;
        }
      }
    }
    
    // User has access - get full playlist details
    let playlistDetails;
    if (userId) {
      // For authenticated users - include favorite status
      playlistDetails = await sql`
        SELECT 
          p."ID_playlisty" as "id",
          p."nazwa_playlisty" as "name",
          p."imageFilename",
          p."imagePath",
          p."imageMimetype",
          p."imageSize",
          p."isPrivate",
          p."allowFriendsAccess",
          u."nick" as "createdBy",
          p."ID_uzytkownik" as "ownerId",
          COUNT(DISTINCT pp."ID_uzytkownik") as "likeCount",
          CASE WHEN pp_current."ID_playlisty" IS NOT NULL THEN true ELSE false END as "isFavorite"
        FROM "Playlista" p
        JOIN "Uzytkownik" u ON p."ID_uzytkownik" = u."ID_uzytkownik"
        LEFT JOIN "PolubieniaPlaylist" pp ON p."ID_playlisty" = pp."ID_playlisty"
        LEFT JOIN "PolubieniaPlaylist" pp_current ON p."ID_playlisty" = pp_current."ID_playlisty" AND pp_current."ID_uzytkownik" = ${userId}
        WHERE p."ID_playlisty" = ${playlistId}
        GROUP BY p."ID_playlisty", p."nazwa_playlisty", p."imageFilename", p."imagePath", p."imageMimetype", p."imageSize", p."isPrivate", p."allowFriendsAccess", u."nick", p."ID_uzytkownik", pp_current."ID_playlisty"
      `;
    } else {
      // For non-authenticated users - no favorite status
      playlistDetails = await sql`
        SELECT 
          p."ID_playlisty" as "id",
          p."nazwa_playlisty" as "name",
          p."imageFilename",
          p."imagePath",
          p."imageMimetype",
          p."imageSize",
          p."isPrivate",
          p."allowFriendsAccess",
          u."nick" as "createdBy",
          p."ID_uzytkownik" as "ownerId",
          COUNT(DISTINCT pp."ID_uzytkownik") as "likeCount",
          false as "isFavorite"
        FROM "Playlista" p
        JOIN "Uzytkownik" u ON p."ID_uzytkownik" = u."ID_uzytkownik"
        LEFT JOIN "PolubieniaPlaylist" pp ON p."ID_playlisty" = pp."ID_playlisty"
        WHERE p."ID_playlisty" = ${playlistId}
        GROUP BY p."ID_playlisty", p."nazwa_playlisty", p."imageFilename", p."imagePath", p."imageMimetype", p."imageSize", p."isPrivate", p."allowFriendsAccess", u."nick", p."ID_uzytkownik"
      `;
    }
    
    const playlistData = playlistDetails[0];
    // isOwner is false for non-authenticated users or if the user is not the owner
    const isOwner = userId ? playlistData.ownerId === userId : false;
    
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

// Create a new playlist - requires authentication
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { name, isPrivate, allowFriendsAccess } = req.body;
    
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Nazwa playlisty jest wymagana' });
      return;
    }
    
    // Get user's nick for response
    const user = await sql`
      SELECT "nick" FROM "Uzytkownik" WHERE "ID_uzytkownik" = ${userId}
    `;
    
    // Set default values for privacy settings if not provided
    const privacyStatus = isPrivate === true;
    const friendsAccess = allowFriendsAccess === undefined ? true : allowFriendsAccess === true;
    
    // Create the playlist with privacy settings
    const result = await sql`
      INSERT INTO "Playlista" ("ID_uzytkownik", "nazwa_playlisty", "isPrivate", "allowFriendsAccess")
      VALUES (${userId}, ${name}, ${privacyStatus}, ${friendsAccess})
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
        likeCount: 0,
        isOwner: true,
        isFavorite: false,
        isPrivate: privacyStatus,
        allowFriendsAccess: friendsAccess
      }
    });
    
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas tworzenia playlisty' });
  }
});

// Update a playlist - requires authentication
router.put('/:playlistId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    const { name, isPrivate, allowFriendsAccess } = req.body;
    
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
    
    // Build update query dynamically
    let hasUpdates = false;
    
    if (name !== undefined && typeof name === 'string') {
      await sql`
        UPDATE "Playlista"
        SET "nazwa_playlisty" = ${name}
        WHERE "ID_playlisty" = ${playlistId}
      `;
      hasUpdates = true;
    }
    
    if (isPrivate !== undefined) {
      await sql`
        UPDATE "Playlista"
        SET "isPrivate" = ${isPrivate === true}
        WHERE "ID_playlisty" = ${playlistId}
      `;
      hasUpdates = true;
    }
    
    if (allowFriendsAccess !== undefined) {
      await sql`
        UPDATE "Playlista"
        SET "allowFriendsAccess" = ${allowFriendsAccess === true}
        WHERE "ID_playlisty" = ${playlistId}
      `;
      hasUpdates = true;
    }
    
    if (!hasUpdates) {
      res.status(400).json({ error: 'Brak danych do aktualizacji' });
      return;
    }
    
    res.status(200).json({
      success: true,
      message: 'Playlista została zaktualizowana'
    });
    
  } catch (error) {
    console.error('Error updating playlist:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas aktualizacji playlisty' });
  }
});

// Update playlist privacy settings - requires authentication
router.put('/:playlistId/privacy', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    const { isPrivate, allowFriendsAccess } = req.body;
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    if (isPrivate === undefined && allowFriendsAccess === undefined) {
      res.status(400).json({ error: 'Musisz określić przynajmniej jedno ustawienie prywatności' });
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
    
    // Update privacy settings
    if (isPrivate !== undefined && allowFriendsAccess !== undefined) {
      await sql`
        UPDATE "Playlista"
        SET "isPrivate" = ${isPrivate === true},
            "allowFriendsAccess" = ${allowFriendsAccess === true}
        WHERE "ID_playlisty" = ${playlistId}
      `;
    } else if (isPrivate !== undefined) {
      await sql`
        UPDATE "Playlista"
        SET "isPrivate" = ${isPrivate === true}
        WHERE "ID_playlisty" = ${playlistId}
      `;
    } else if (allowFriendsAccess !== undefined) {
      await sql`
        UPDATE "Playlista"
        SET "allowFriendsAccess" = ${allowFriendsAccess === true}
        WHERE "ID_playlisty" = ${playlistId}
      `;
    }
    
    res.status(200).json({
      success: true,
      message: 'Ustawienia prywatności playlisty zostały zaktualizowane',
      settings: {
        isPrivate: isPrivate !== undefined ? isPrivate === true : undefined,
        allowFriendsAccess: allowFriendsAccess !== undefined ? allowFriendsAccess === true : undefined
      }
    });
    
  } catch (error) {
    console.error('Error updating playlist privacy:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas aktualizacji ustawień prywatności' });
  }
});

// Get users who have access to a playlist - requires authentication, owner only
router.get('/:playlistId/access', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    // Check if playlist exists and belongs to the user
    const playlist = await sql`
      SELECT "ID_playlisty", "isPrivate", "allowFriendsAccess" FROM "Playlista"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (playlist.length === 0) {
      res.status(404).json({ error: 'Playlista nie istnieje lub nie należy do ciebie' });
      return;
    }
    
    // Get users with explicit access
    const usersWithAccess = await sql`
      SELECT u."ID_uzytkownik" as "id", u."nick", pd."data_dodania" as "addedAt"
      FROM "PlaylistaDostep" pd
      JOIN "Uzytkownik" u ON pd."ID_uzytkownik" = u."ID_uzytkownik"
      WHERE pd."ID_playlisty" = ${playlistId}
      ORDER BY pd."data_dodania" DESC
    `;
    
    // If playlist allows friends access, get friends list
    let friendsWithAccess = [];
    if (playlist[0].isPrivate && playlist[0].allowFriendsAccess) {
      friendsWithAccess = await sql`
        SELECT 
          u."ID_uzytkownik" as "id", 
          u."nick",
          CASE
            WHEN f1."ID_uzytkownik1" IS NOT NULL THEN f1."data_dodania"
            ELSE f2."data_dodania"
          END as "friendSince"
        FROM "Uzytkownik" u
        LEFT JOIN "Znajomi" f1 ON (u."ID_uzytkownik" = f1."ID_uzytkownik2" AND f1."ID_uzytkownik1" = ${userId} AND f1."status" = 'accepted')
        LEFT JOIN "Znajomi" f2 ON (u."ID_uzytkownik" = f2."ID_uzytkownik1" AND f2."ID_uzytkownik2" = ${userId} AND f2."status" = 'accepted')
        WHERE f1."ID_znajomych" IS NOT NULL OR f2."ID_znajomych" IS NOT NULL
        ORDER BY u."nick"
      `;
    }
    
    res.status(200).json({
      success: true,
      usersWithAccess,
      friendsWithAccess,
      privacySettings: {
        isPrivate: playlist[0].isPrivate,
        allowFriendsAccess: playlist[0].allowFriendsAccess
      }
    });
    
  } catch (error) {
    console.error('Error getting playlist access list:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania listy dostępu' });
  }
});

// Grant access to a user for a playlist - requires authentication, owner only
router.post('/:playlistId/access', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    const { targetUserId } = req.body;
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    if (!targetUserId || isNaN(Number(targetUserId))) {
      res.status(400).json({ error: 'Nieprawidłowe ID użytkownika' });
      return;
    }
    
    // Check if playlist exists and belongs to the user
    const playlist = await sql`
      SELECT "ID_playlisty", "isPrivate" FROM "Playlista"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (playlist.length === 0) {
      res.status(404).json({ error: 'Playlista nie istnieje lub nie należy do ciebie' });
      return;
    }
    
    // Check if the playlist is private
    if (!playlist[0].isPrivate) {
      res.status(400).json({ error: 'Nie można dodać dostępu do publicznej playlisty' });
      return;
    }
    
    // Check if target user exists
    const targetUser = await sql`
      SELECT "ID_uzytkownik", "nick" FROM "Uzytkownik"
      WHERE "ID_uzytkownik" = ${Number(targetUserId)}
    `;
    
    if (targetUser.length === 0) {
      res.status(404).json({ error: 'Użytkownik nie istnieje' });
      return;
    }
    
    // Check if access already exists
    const existingAccess = await sql`
      SELECT "ID_dostep" FROM "PlaylistaDostep"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${Number(targetUserId)}
    `;
    
    if (existingAccess.length > 0) {
      res.status(409).json({ error: 'Użytkownik już ma dostęp do tej playlisty' });
      return;
    }
    
    // Grant access
    await sql`
      INSERT INTO "PlaylistaDostep" ("ID_playlisty", "ID_uzytkownik")
      VALUES (${playlistId}, ${Number(targetUserId)})
    `;
    
    res.status(201).json({
      success: true,
      message: `Dostęp przyznany użytkownikowi ${targetUser[0].nick}`,
      grantedTo: {
        id: targetUser[0].id,
        nick: targetUser[0].nick
      }
    });
    
  } catch (error) {
    console.error('Error granting playlist access:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas przyznawania dostępu do playlisty' });
  }
});

// Revoke access from a user for a playlist - requires authentication, owner only
router.delete('/:playlistId/access/:targetUserId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    const targetUserId = Number(req.params.targetUserId);
    
    if (isNaN(playlistId) || isNaN(targetUserId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty lub użytkownika' });
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
    
    // Check if access exists
    const existingAccess = await sql`
      SELECT "ID_dostep" FROM "PlaylistaDostep"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${targetUserId}
    `;
    
    if (existingAccess.length === 0) {
      res.status(404).json({ error: 'Użytkownik nie ma bezpośredniego dostępu do tej playlisty' });
      return;
    }
    
    // Revoke access
    await sql`
      DELETE FROM "PlaylistaDostep"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${targetUserId}
    `;
    
    res.status(200).json({
      success: true,
      message: 'Dostęp do playlisty został cofnięty'
    });
    
  } catch (error) {
    console.error('Error revoking playlist access:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas cofania dostępu do playlisty' });
  }
});

// Delete a playlist - requires authentication
router.delete('/:playlistId', authenticate, async (req: Request, res: Response): Promise<void> => {
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
    
    // Delete all playlist favorites first (due to foreign key constraints)
    await sql`
      DELETE FROM "PolubieniaPlaylist"
      WHERE "ID_playlisty" = ${playlistId}
    `;
    
    // Delete all access permissions (for private playlists)
    await sql`
      DELETE FROM "PlaylistaDostep"
      WHERE "ID_playlisty" = ${playlistId}
    `;
    
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

// Get playlists shared with the current user - requires authentication
router.get('/shared/with-me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    
    // Get playlists explicitly shared with the user
    const explicitShared = await sql`
      SELECT 
        p."ID_playlisty" as "id",
        p."nazwa_playlisty" as "name",
        p."imageFilename",
        p."imagePath",
        p."imageMimetype",
        p."imageSize",
        p."isPrivate",
        p."allowFriendsAccess",
        u."nick" as "createdBy",
        u."ID_uzytkownik" as "ownerId",
        COUNT(DISTINCT pu."ID_utworu") as "songCount",
        COUNT(DISTINCT pp."ID_uzytkownik") as "likeCount",
        CASE WHEN pp_current."ID_playlisty" IS NOT NULL THEN true ELSE false END as "isFavorite",
        'explicit' as "accessType",
        pd."data_dodania" as "sharedAt"
      FROM "PlaylistaDostep" pd
      JOIN "Playlista" p ON pd."ID_playlisty" = p."ID_playlisty"
      JOIN "Uzytkownik" u ON p."ID_uzytkownik" = u."ID_uzytkownik"
      LEFT JOIN "PlaylistaUtwor" pu ON p."ID_playlisty" = pu."ID_playlisty"
      LEFT JOIN "PolubieniaPlaylist" pp ON p."ID_playlisty" = pp."ID_playlisty"
      LEFT JOIN "PolubieniaPlaylist" pp_current ON p."ID_playlisty" = pp_current."ID_playlisty" AND pp_current."ID_uzytkownik" = ${userId}
      WHERE pd."ID_uzytkownik" = ${userId} AND p."ID_uzytkownik" != ${userId}
      GROUP BY p."ID_playlisty", p."nazwa_playlisty", p."imageFilename", p."imagePath", p."imageMimetype", p."imageSize", p."isPrivate", p."allowFriendsAccess", u."nick", u."ID_uzytkownik", pp_current."ID_playlisty", pd."data_dodania"
    `;
    
    // Get playlists shared via friend relationship
    const friendShared = await sql`
      SELECT 
        p."ID_playlisty" as "id",
        p."nazwa_playlisty" as "name",
        p."imageFilename",
        p."imagePath",
        p."imageMimetype",
        p."imageSize",
        p."isPrivate",
        p."allowFriendsAccess",
        u."nick" as "createdBy",
        u."ID_uzytkownik" as "ownerId",
        COUNT(DISTINCT pu."ID_utworu") as "songCount",
        COUNT(DISTINCT pp."ID_uzytkownik") as "likeCount",
        CASE WHEN pp_current."ID_playlisty" IS NOT NULL THEN true ELSE false END as "isFavorite",
        'friend' as "accessType",
        CASE 
          WHEN f1."data_dodania" IS NOT NULL THEN f1."data_dodania"
          ELSE f2."data_dodania"
        END as "friendSince"
      FROM "Playlista" p
      JOIN "Uzytkownik" u ON p."ID_uzytkownik" = u."ID_uzytkownik"
      LEFT JOIN "Znajomi" f1 ON (p."ID_uzytkownik" = f1."ID_uzytkownik1" AND f1."ID_uzytkownik2" = ${userId} AND f1."status" = 'accepted')
      LEFT JOIN "Znajomi" f2 ON (p."ID_uzytkownik" = f2."ID_uzytkownik2" AND f2."ID_uzytkownik1" = ${userId} AND f2."status" = 'accepted')
      LEFT JOIN "PlaylistaUtwor" pu ON p."ID_playlisty" = pu."ID_playlisty"
      LEFT JOIN "PolubieniaPlaylist" pp ON p."ID_playlisty" = pp."ID_playlisty"
      LEFT JOIN "PolubieniaPlaylist" pp_current ON p."ID_playlisty" = pp_current."ID_playlisty" AND pp_current."ID_uzytkownik" = ${userId}
      LEFT JOIN "PlaylistaDostep" pd ON p."ID_playlisty" = pd."ID_playlisty" AND pd."ID_uzytkownik" = ${userId}
      WHERE 
        p."isPrivate" = true AND 
        p."allowFriendsAccess" = true AND 
        (f1."ID_znajomych" IS NOT NULL OR f2."ID_znajomych" IS NOT NULL) AND
        p."ID_uzytkownik" != ${userId} AND
        pd."ID_dostep" IS NULL
      GROUP BY p."ID_playlisty", p."nazwa_playlisty", p."imageFilename", p."imagePath", p."imageMimetype", p."imageSize", p."isPrivate", p."allowFriendsAccess", u."nick", u."ID_uzytkownik", pp_current."ID_playlisty", f1."data_dodania", f2."data_dodania"
    `;
    
    res.status(200).json({
      success: true,
      explicitShared,
      friendShared
    });
    
  } catch (error) {
    console.error('Error fetching shared playlists:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania udostępnionych playlist' });
  }
});

// Toggle favorite status for a playlist - requires authentication
router.post('/:playlistId/favorite', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const playlistId = Number(req.params.playlistId);
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    // Check if playlist exists and if user has access
    const playlistData = await sql`
      SELECT 
        p."ID_playlisty",
        p."ID_uzytkownik" as "ownerId",
        p."isPrivate",
        p."allowFriendsAccess"
      FROM "Playlista" p
      WHERE p."ID_playlisty" = ${playlistId}
    `;
    
    if (playlistData.length === 0) {
      res.status(404).json({ error: 'Playlista nie istnieje' });
      return;
    }
    
    const playlist = playlistData[0];
    
    // Check if user has access to this playlist
    if (playlist.isPrivate && playlist.ownerId !== userId) {
      const hasAccess = await sql`
        SELECT 1 FROM "PlaylistaDostep" 
        WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
      `;
      
      if (hasAccess.length === 0 && playlist.allowFriendsAccess) {
        const isFriend = await sql`
          SELECT 1 FROM "Znajomi"
          WHERE (("ID_uzytkownik1" = ${playlist.ownerId} AND "ID_uzytkownik2" = ${userId}) OR
                ("ID_uzytkownik1" = ${userId} AND "ID_uzytkownik2" = ${playlist.ownerId}))
          AND "status" = 'accepted'
        `;
        
        if (isFriend.length === 0) {
          res.status(403).json({ error: 'Brak dostępu do tej playlisty' });
          return;
        }
      } else if (hasAccess.length === 0) {
        res.status(403).json({ error: 'Brak dostępu do tej playlisty' });
        return;
      }
    }
    
    // Check if the playlist is already liked by the user
    const existingLike = await sql`
      SELECT "ID_playlisty", "data_polubienia" FROM "PolubieniaPlaylist"
      WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
    `;
    
    if (existingLike.length > 0) {
      // Unlike the playlist
      await sql`
        DELETE FROM "PolubieniaPlaylist"
        WHERE "ID_playlisty" = ${playlistId} AND "ID_uzytkownik" = ${userId}
      `;
      
      res.status(200).json({
        success: true,
        isFavorite: false,
        message: 'Playlista usunięta z polubionych'
      });
    } else {
      // Like the playlist
      const now = new Date().toISOString();
      await sql`
        INSERT INTO "PolubieniaPlaylist" ("ID_playlisty", "ID_uzytkownik", "data_polubienia")
        VALUES (${playlistId}, ${userId}, ${now})
      `;
      
      res.status(200).json({
        success: true,
        isFavorite: true,
        message: 'Playlista dodana do polubionych'
      });
    }
  } catch (error) {
    console.error('Error toggling playlist favorite:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas aktualizacji statusu polubienia' });
  }
});

// Endpoint do przesyłania obrazów playlist - requires authentication
router.post('/:playlistId/image', authenticate, playlistImageUpload.single('image'), async (req: RequestWithFile, res: Response): Promise<void> => {
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

// Endpoint do wyświetlania obrazów playlist - accessible to all
router.get('/:playlistId/image', async (req: Request, res: Response): Promise<void> => {
  try {
    const playlistId = Number(req.params.playlistId);
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    // Get image info without checking ownership
    const result = await sql`
      SELECT "imagePath", "imageFilename", "imageMimetype"
      FROM "Playlista"
      WHERE "ID_playlisty" = ${playlistId}
    `;
    
    if (result.length === 0) {
      res.status(404).json({ 
        success: false,
        message: 'Playlista nie istnieje' 
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
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ 
        success: false,
        message: 'Plik obrazu nie istnieje'
      });
      return;
    }
    
    // Get file stats
    const stat = fs.statSync(filePath);
    
    // Set headers
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': playlist.imageMimetype || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000' // Cache for a year
    });
    
    // Send file
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

// Endpoint do usuwania obrazu playlisty - requires authentication
router.delete('/:playlistId/image', authenticate, async (req: Request, res: Response): Promise<void> => {
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

// Delete a playlist - requires authentication
router.delete('/:playlistId', authenticate, async (req: Request, res: Response): Promise<void> => {
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
    
    // Delete all playlist favorites first (due to foreign key constraints)
    await sql`
      DELETE FROM "PolubieniaPlaylist"
      WHERE "ID_playlisty" = ${playlistId}
    `;
    
    // Delete all access permissions (for private playlists)
    await sql`
      DELETE FROM "PlaylistaDostep"
      WHERE "ID_playlisty" = ${playlistId}
    `;
    
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

// Get all songs in a specific playlist - accessible to all
router.get('/:playlistId/songs', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId; // May be undefined for non-authenticated users
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
    
    // isOwner is false for non-authenticated users or if the user is not the owner
    const isOwner = userId ? playlist[0].ownerId === userId : false;
    
    res.status(200).json({ 
      songs,
      playlistInfo: {
        createdBy: playlist[0].createdBy,
        isOwner
      }
    });
    
  } catch (error) {
    console.error('Error fetching playlist songs:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania utworów z playlisty' });
  }
});

// Get all liked playlists for the current user - requires authentication
router.get('/favorites/all', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;

    // Get all playlists liked by the current user
    const likedPlaylists = await sql`
      SELECT 
        p."ID_playlisty" as "id",
        p."nazwa_playlisty" as "name",
        p."imageFilename",
        p."imagePath", 
        p."imageMimetype",
        p."imageSize",
        u."nick" as "createdBy",
        pp."data_polubienia" as "likedAt",
        COUNT(DISTINCT pu."ID_utworu") as "songCount",
        COUNT(DISTINCT pp_all."ID_uzytkownik") as "likeCount",
        true as "isFavorite",
        CASE WHEN p."ID_uzytkownik" = ${userId} THEN true ELSE false END as "isOwner"
      FROM "PolubieniaPlaylist" pp
      JOIN "Playlista" p ON pp."ID_playlisty" = p."ID_playlisty"
      JOIN "Uzytkownik" u ON p."ID_uzytkownik" = u."ID_uzytkownik"
      LEFT JOIN "PlaylistaUtwor" pu ON p."ID_playlisty" = pu."ID_playlisty"
      LEFT JOIN "PolubieniaPlaylist" pp_all ON p."ID_playlisty" = pp_all."ID_playlisty"
      WHERE pp."ID_uzytkownik" = ${userId}
      GROUP BY p."ID_playlisty", p."nazwa_playlisty", p."imageFilename", p."imagePath", p."imageMimetype", p."imageSize", u."nick", pp."data_polubienia", p."ID_uzytkownik"
      ORDER BY pp."data_polubienia" DESC
    `;
    
    res.status(200).json({ 
      playlists: likedPlaylists,
      message: 'Polubione playlisty pobrane pomyślnie'
    });
    
  } catch (error) {
    console.error('Error fetching liked playlists:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania polubionych playlist' });
  }
});

export default router;
