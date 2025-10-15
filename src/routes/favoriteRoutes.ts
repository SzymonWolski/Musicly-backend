import { Request, Response, Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authMiddleware';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number(req.userId);
    
    if (isNaN(userId)) {
      res.status(401).json({ error: 'Nieprawidłowe ID użytkownika' });
      return;
    }

    const favorites = await prisma.polubienia.findMany({
      where: {
        ID_uzytkownik: userId,
      },
      select: {
        ID_piosenki: true,
        data_polubienia: true,
        Utwor: {
          select: {
            nazwa_utworu: true,
            Autor: {
              select: {
                kryptonim_artystyczny: true
              }
            }
          }
        }
      },
      orderBy: {
        data_polubienia: 'desc'
      }
    });
    
    const formattedFavorites = favorites.map(fav => ({
      songId: fav.ID_piosenki,
      likedAt: fav.data_polubienia,
      songName: fav.Utwor.nazwa_utworu,
      artistName: fav.Utwor.Autor.kryptonim_artystyczny
    }));
    
    res.status(200).json({ favorites: formattedFavorites });
    
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania ulubionych' });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number(req.userId);
    
    if (isNaN(userId)) {
      res.status(401).json({ error: 'Nieprawidłowe ID użytkownika' });
      return;
    }
    
    const { songId } = req.body;
    
    if (!songId) {
      res.status(400).json({ error: 'ID utworu jest wymagane' });
      return;
    }
    
    const song = await prisma.utwor.findUnique({
      where: {
        ID_utworu: Number(songId)
      }
    });
    
    if (!song) {
      res.status(404).json({ error: 'Utwór nie istnieje' });
      return;
    }
    
    const existingFavorite = await prisma.polubienia.findUnique({
      where: {
        ID_piosenki_ID_uzytkownik: {
          ID_piosenki: Number(songId),
          ID_uzytkownik: userId
        }
      }
    });
    
    if (existingFavorite) {
      res.status(409).json({ error: 'Utwór jest już w ulubionych' });
      return;
    }
    
    const currentDate = new Date().toISOString();
    
    await prisma.polubienia.create({
      data: {
        ID_piosenki: Number(songId),
        ID_uzytkownik: userId,
        data_polubienia: currentDate
      }
    });
    
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

router.delete('/:songId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number(req.userId);
    
    if (isNaN(userId)) {
      res.status(401).json({ error: 'Nieprawidłowe ID użytkownika' });
      return;
    }
    
    const songId = Number(req.params.songId);
    
    if (isNaN(songId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID utworu' });
      return;
    }
    
    const favorite = await prisma.polubienia.findUnique({
      where: {
        ID_piosenki_ID_uzytkownik: {
          ID_piosenki: songId,
          ID_uzytkownik: userId
        }
      }
    });
    
    if (!favorite) {
      res.status(404).json({ error: 'Utwór nie jest w ulubionych' });
      return;
    }
    
    await prisma.polubienia.delete({
      where: {
        ID_piosenki_ID_uzytkownik: {
          ID_piosenki: songId,
          ID_uzytkownik: userId
        }
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Utwór usunięty z ulubionych'
    });
    
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas usuwania ulubionego' });
  }
});

router.get('/playlists', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number(req.userId);
    
    if (isNaN(userId)) {
      res.status(401).json({ error: 'Nieprawidłowe ID użytkownika' });
      return;
    }

    const favoritePlaylists = await prisma.polubieniaPlaylist.findMany({
      where: {
        ID_uzytkownik: userId
      },
      select: {
        ID_playlisty: true,
        data_polubienia: true,
        Playlista: {
          select: {
            nazwa_playlisty: true,
            imageFilename: true,
            imagePath: true,
            imageMimetype: true,
            imageSize: true,
            Uzytkownik: {
              select: {
                nick: true
              }
            },
            Utwory: {
              select: {
                ID_utworu: true
              }
            },
            PolubieniaPlaylist: {
              select: {
                ID_uzytkownik: true
              }
            }
          }
        }
      },
      orderBy: {
        data_polubienia: 'desc'
      }
    });

    const formattedPlaylists = favoritePlaylists.map(fp => ({
      playlistId: fp.ID_playlisty,
      likedAt: fp.data_polubienia,
      playlistName: fp.Playlista.nazwa_playlisty,
      createdBy: fp.Playlista.Uzytkownik.nick,
      imageFilename: fp.Playlista.imageFilename,
      imagePath: fp.Playlista.imagePath,
      imageMimetype: fp.Playlista.imageMimetype,
      imageSize: fp.Playlista.imageSize,
      songCount: fp.Playlista.Utwory.length,
      likeCount: fp.Playlista.PolubieniaPlaylist.length
    }));
    
    res.status(200).json({ favoritePlaylists: formattedPlaylists });
    
  } catch (error) {
    console.error('Error fetching favorite playlists:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania ulubionych playlist' });
  }
});

router.post('/playlists', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number(req.userId);
    
    if (isNaN(userId)) {
      res.status(401).json({ error: 'Nieprawidłowe ID użytkownika' });
      return;
    }
    
    const { playlistId } = req.body;
    
    if (!playlistId) {
      res.status(400).json({ error: 'ID playlisty jest wymagane' });
      return;
    }
    
    const playlist = await prisma.playlista.findUnique({
      where: {
        ID_playlisty: Number(playlistId)
      }
    });
    
    if (!playlist) {
      res.status(404).json({ error: 'Playlista nie istnieje' });
      return;
    }
    
    const existingFavorite = await prisma.polubieniaPlaylist.findUnique({
      where: {
        ID_playlisty_ID_uzytkownik: {
          ID_playlisty: Number(playlistId),
          ID_uzytkownik: userId
        }
      }
    });
    
    if (existingFavorite) {
      res.status(409).json({ error: 'Playlista jest już w ulubionych' });
      return;
    }
    
    const currentDate = new Date().toISOString();
    
    await prisma.polubieniaPlaylist.create({
      data: {
        ID_playlisty: Number(playlistId),
        ID_uzytkownik: userId,
        data_polubienia: currentDate
      }
    });
    
    res.status(201).json({ 
      success: true,
      message: 'Playlista dodana do ulubionych',
      data: {
        playlistId: Number(playlistId),
        userId: userId,
        likedAt: currentDate
      }
    });
    
  } catch (error) {
    console.error('Error adding favorite playlist:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas dodawania ulubionej playlisty' });
  }
});

router.delete('/playlists/:playlistId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number(req.userId);
    
    if (isNaN(userId)) {
      res.status(401).json({ error: 'Nieprawidłowe ID użytkownika' });
      return;
    }
    
    const playlistId = Number(req.params.playlistId);
    
    if (isNaN(playlistId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID playlisty' });
      return;
    }
    
    const favorite = await prisma.polubieniaPlaylist.findUnique({
      where: {
        ID_playlisty_ID_uzytkownik: {
          ID_playlisty: playlistId,
          ID_uzytkownik: userId
        }
      }
    });
    
    if (!favorite) {
      res.status(404).json({ error: 'Playlista nie jest w ulubionych' });
      return;
    }
    
    await prisma.polubieniaPlaylist.delete({
      where: {
        ID_playlisty_ID_uzytkownik: {
          ID_playlisty: playlistId,
          ID_uzytkownik: userId
        }
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Playlista usunięta z ulubionych'
    });
    
  } catch (error) {
    console.error('Error removing favorite playlist:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas usuwania ulubionej playlisty' });
  }
});

export default router;
