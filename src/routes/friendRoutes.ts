import { Request, Response } from 'express';
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authMiddleware';

const prisma = new PrismaClient();
const router = Router();

// Apply authentication middleware to all friend routes
router.use(authenticate);

// Get all friendships for the logged in user
router.get('/list', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number(req.userId || res.locals.userId);
    
    if (isNaN(userId)) {
      res.status(401).json({ error: 'Nieprawidłowe ID użytkownika' });
      return;
    }
    
    const friendships = await prisma.znajomi.findMany({
      where: {
        OR: [
          { ID_uzytkownik1: userId },
          { ID_uzytkownik2: userId }
        ]
      },
      include: {
        Uzytkownik1: {
          select: {
            nick: true,
            email: true
          }
        },
        Uzytkownik2: {
          select: {
            nick: true,
            email: true
          }
        }
      }
    });
    
    res.status(200).json({ friendships });
    return;
  } catch (error) {
    console.error('Error getting friends:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania znajomych' });
    return;
  }
});

// Search users by nickname, email, or ID
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number(res.locals.userId);
    
    if (isNaN(userId)) {
      res.status(401).json({ error: 'Nieprawidłowe ID użytkownika' });
      return;
    }
    
    const { query, searchType } = req.query;
    
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query parameter jest wymagany' });
      return;
    }
    
    let users;
    
    if (searchType === 'id') {
      const searchDigits = query.trim();
      
      if (!/^\d+$/.test(searchDigits)) {
        res.status(400).json({ error: 'Wyszukiwanie po ID wymaga tylko cyfr' });
        return;
      }
      
      users = await prisma.uzytkownik.findMany({
        where: {
          ID_uzytkownik: {
            not: userId
          },
          AND: {
            ID_uzytkownik: {
              in: searchDigits.split('').map(digit => Number(digit))
            }
          }
        },
        select: {
          ID_uzytkownik: true,
          nick: true,
          email: true
        },
        orderBy: {
          ID_uzytkownik: 'asc'
        },
        take: 50
      });
    } else {
      const searchTerm = query.toLowerCase();
      
      users = await prisma.uzytkownik.findMany({
        where: {
          ID_uzytkownik: {
            not: userId
          },
          OR: [
            {
              nick: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            },
            {
              email: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            }
          ]
        },
        select: {
          ID_uzytkownik: true,
          nick: true,
          email: true
        },
        orderBy: {
          nick: 'asc'
        },
        take: 50
      });
    }
    
    res.status(200).json({
      success: true,
      users: users || []
    });
    return;
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ 
      error: 'Wystąpił błąd podczas wyszukiwania użytkowników',
      details: error instanceof Error ? error.message : String(error)
    });
    return;
  }
});

// Send a friend request
router.post('/request', async (req: Request, res: Response): Promise<void> => {
  try {
    const senderId = Number(res.locals.userId);
    const recipientId = Number(req.body.recipientId);
    
    if (isNaN(senderId) || isNaN(recipientId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID użytkownika' });
      return;
    }
    
    // Check if users exist
    const sender = await prisma.uzytkownik.findUnique({
      where: { ID_uzytkownik: senderId }
    });
    
    const recipient = await prisma.uzytkownik.findUnique({
      where: { ID_uzytkownik: recipientId }
    });
    
    if (!sender || !recipient) {
      res.status(404).json({ error: 'Użytkownik nie istnieje' });
      return;
    }
    
    // Check if friendship already exists with sender as requester
    const existingOutgoing = await prisma.znajomi.findFirst({
      where: {
        ID_uzytkownik1: senderId,
        ID_uzytkownik2: recipientId
      }
    });
    
    if (existingOutgoing) {
      res.status(400).json({
        error: 'Wysłałeś już zaproszenie do tego użytkownika',
        status: 'outgoing'
      });
      return;
    }
    
    // Check if friendship already exists with sender as recipient
    const existingIncoming = await prisma.znajomi.findFirst({
      where: {
        ID_uzytkownik1: recipientId,
        ID_uzytkownik2: senderId
      }
    });
    
    if (existingIncoming) {
      res.status(400).json({
        error: 'Ten użytkownik już wysłał Ci zaproszenie',
        status: 'incoming',
        friendshipId: existingIncoming.ID_znajomych
      });
      return;
    }
    
    // Create friendship request
    const newFriendship = await prisma.znajomi.create({
      data: {
        ID_uzytkownik1: senderId,
        ID_uzytkownik2: recipientId,
        status: 'pending',
        data_dodania: new Date()
      }
    });
    
    res.status(201).json({ 
      success: true, 
      friendshipId: newFriendship.ID_znajomych 
    });
    return;
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas wysyłania zaproszenia' });
    return;
  }
});

// Accept a friend request
router.put('/accept/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const friendshipId = Number(req.params.id);
    const userId = Number(res.locals.userId);
    
    if (isNaN(friendshipId) || isNaN(userId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID' });
      return;
    }
    
    // Find the friendship
    const friendship = await prisma.znajomi.findUnique({
      where: {
        ID_znajomych: friendshipId
      }
    });
    
    if (!friendship) {
      res.status(404).json({ error: 'Zaproszenie nie zostało znalezione' });
      return;
    }
    
    // Ensure the current user is the recipient of the request
    if (friendship.ID_uzytkownik2 !== userId) {
      res.status(403).json({ error: 'Nie masz uprawnień do akceptacji tego zaproszenia' });
      return;
    }
    
    // Update the friendship status
    await prisma.znajomi.update({
      where: {
        ID_znajomych: friendshipId
      },
      data: {
        status: 'accepted'
      }
    });
    
    res.status(200).json({ success: true });
    return;
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas akceptowania zaproszenia' });
    return;
  }
});

// Reject a friend request
router.delete('/reject/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const friendshipId = Number(req.params.id);
    const userId = Number(res.locals.userId);
    
    if (isNaN(friendshipId) || isNaN(userId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID' });
      return;
    }
    
    // Find the friendship
    const friendship = await prisma.znajomi.findUnique({
      where: {
        ID_znajomych: friendshipId
      }
    });
    
    if (!friendship) {
      res.status(404).json({ error: 'Zaproszenie nie została znaleziona' });
      return;
    }
    
    // Ensure the current user is the recipient of the request
    if (friendship.ID_uzytkownik2 !== userId) {
      res.status(403).json({ error: 'Nie masz uprawnień do odrzucenia tego zaproszenia' });
      return;
    }
    
    // Delete the friendship record
    await prisma.znajomi.delete({
      where: {
        ID_znajomych: friendshipId
      }
    });
    
    res.status(200).json({ success: true });
    return;
  } catch (error) {
    console.error('Error rejecting friend request:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas odrzucania zaproszenia' });
    return;
  }
});

// Remove a friend
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const friendshipId = Number(req.params.id);
    const userId = Number(res.locals.userId);
    
    if (isNaN(friendshipId) || isNaN(userId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID' });
      return;
    }
    
    // Find the friendship
    const friendship = await prisma.znajomi.findUnique({
      where: {
        ID_znajomych: friendshipId
      }
    });
    
    if (!friendship) {
      res.status(404).json({ error: 'Znajomy nie został znaleziony' });
      return;
    }
    
    // Ensure the current user is part of this friendship
    if (friendship.ID_uzytkownik1 !== userId && friendship.ID_uzytkownik2 !== userId) {
      res.status(403).json({ error: 'Nie masz uprawnień do usunięcia tego znajomego' });
      return;
    }
    
    // Delete the friendship record
    await prisma.znajomi.delete({
      where: {
        ID_znajomych: friendshipId
      }
    });
    
    res.status(200).json({ success: true });
    return;
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas usuwania znajomego' });
    return;
  }
});

export default router;