import { Request, Response } from 'express';
import { Router } from 'express';
import { sql } from 'bun';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Apply authentication middleware to all friend routes
router.use(authenticate);

// Get all friendships for the logged in user
router.get('/list', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId || res.locals.userId; // From auth middleware
    
    // Fetch all friendships where the user is either party
    const friendships = await sql`
      SELECT 
        z.*,
        u1.nick as "user1_nick",
        u1.email as "user1_email",
        u2.nick as "user2_nick",
        u2.email as "user2_email"
      FROM "Znajomi" z
      JOIN "Uzytkownik" u1 ON z."ID_uzytkownik1" = u1."ID_uzytkownik"
      JOIN "Uzytkownik" u2 ON z."ID_uzytkownik2" = u2."ID_uzytkownik"
      WHERE z."ID_uzytkownik1" = ${userId} OR z."ID_uzytkownik2" = ${userId}
    `;
    
    // Format the data to match the structure expected by the frontend
    const formattedFriendships = friendships.map((friendship: any) => ({
      ID_znajomych: friendship.ID_znajomych,
      ID_uzytkownik1: friendship.ID_uzytkownik1,
      ID_uzytkownik2: friendship.ID_uzytkownik2,
      status: friendship.status,
      data_dodania: friendship.data_dodania,
      Uzytkownik1: {
        nick: friendship.user1_nick,
        email: friendship.user1_email
      },
      Uzytkownik2: {
        nick: friendship.user2_nick,
        email: friendship.user2_email
      }
    }));
    
    res.status(200).json({ friendships: formattedFriendships });
    return;
  } catch (error) {
    console.error('Error getting friends:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania znajomych' });
    return;
  }
});

// Search for users by nick or email
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Wyszukiwana fraza jest wymagana' });
      return;
    }
    
    const trimmedQuery = query.trim();
    const searchPattern = `%${trimmedQuery}%`;
    
    const users = await sql`
      SELECT "ID_uzytkownik", nick, email
      FROM "Uzytkownik"
      WHERE (
        LOWER(nick) LIKE LOWER(${searchPattern}) OR
        LOWER(email) LIKE LOWER(${searchPattern})
      )
    `;
    
    res.status(200).json({ users });
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
    const { recipientId } = req.body;
    const senderId = res.locals.userId;
    
    // Validate input
    if (!recipientId) {
      res.status(400).json({ error: 'ID odbiorcy jest wymagane' });
      return;
    }
    
    if (Number(recipientId) === Number(senderId)) {
      res.status(400).json({ error: 'Nie możesz wysłać zaproszenia do samego siebie' });
      return;
    }
    
    // Check if recipient exists
    const recipient = await sql`
      SELECT "ID_uzytkownik" FROM "Uzytkownik"
      WHERE "ID_uzytkownik" = ${Number(recipientId)}
    `;
    
    if (recipient.length === 0) {
      res.status(404).json({ error: 'Użytkownik nie istnieje' });
      return;
    }
    
    // Check if friendship already exists
    const existingFriendship = await sql`
      SELECT "ID_znajomych", status, "ID_uzytkownik1", "ID_uzytkownik2" 
      FROM "Znajomi"
      WHERE ("ID_uzytkownik1" = ${senderId} AND "ID_uzytkownik2" = ${Number(recipientId)})
      OR ("ID_uzytkownik1" = ${Number(recipientId)} AND "ID_uzytkownik2" = ${senderId})
    `;
    
    if (existingFriendship.length > 0) {
      const friendship = existingFriendship[0];
      
      if (friendship.status === 'accepted') {
        res.status(400).json({ error: 'Jesteście już znajomymi' });
        return;
      } else if (friendship.status === 'pending') {
        // Determine if this is an incoming or outgoing request
        if (friendship.ID_uzytkownik1 === senderId) {
          res.status(400).json({ 
            error: 'Wysłałeś już zaproszenie do tego użytkownika',
            status: 'outgoing'
          });
        } else {
          res.status(400).json({ 
            error: 'Ten użytkownik już wysłał Ci zaproszenie. Sprawdź otrzymane zaproszenia.',
            status: 'incoming',
            friendshipId: friendship.ID_znajomych
          });
        }
        return;
      }
    }
    
    // Create a new friend request
    const newFriendship = await sql`
      INSERT INTO "Znajomi" ("ID_uzytkownik1", "ID_uzytkownik2", status)
      VALUES (${senderId}, ${Number(recipientId)}, 'pending')
      RETURNING "ID_znajomych"
    `;
    
    res.status(201).json({ success: true, friendshipId: newFriendship[0].ID_znajomych });
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
    const { id } = req.params;
    const userId = res.locals.userId;
    
    // Find the friendship
    const friendship = await sql`
      SELECT "ID_znajomych", "ID_uzytkownik1", "ID_uzytkownik2", status
      FROM "Znajomi"
      WHERE "ID_znajomych" = ${Number(id)}
    `;
    
    if (friendship.length === 0) {
      res.status(404).json({ error: 'Zaproszenie nie zostało znalezione' });
      return;
    }
    
    // Ensure the current user is the recipient of the request
    if (friendship[0].ID_uzytkownik2 !== userId) {
      res.status(403).json({ error: 'Nie masz uprawnień do akceptacji tego zaproszenia' });
      return;
    }
    
    // Update the friendship status
    await sql`
      UPDATE "Znajomi"
      SET status = 'accepted'
      WHERE "ID_znajomych" = ${Number(id)}
    `;
    
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
    const { id } = req.params;
    const userId = res.locals.userId;
    
    // Find the friendship
    const friendship = await sql`
      SELECT "ID_znajomych", "ID_uzytkownik1", "ID_uzytkownik2", status
      FROM "Znajomi"
      WHERE "ID_znajomych" = ${Number(id)}
    `;
    
    if (friendship.length === 0) {
      res.status(404).json({ error: 'Zaproszenie nie została znaleziona' });
      return;
    }
    
    // Ensure the current user is the recipient of the request
    if (friendship[0].ID_uzytkownik2 !== userId) {
      res.status(403).json({ error: 'Nie masz uprawnień do odrzucenia tego zaproszenia' });
      return;
    }
    
    // Delete the friendship record
    await sql`
      DELETE FROM "Znajomi"
      WHERE "ID_znajomych" = ${Number(id)}
    `;
    
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
    const { id } = req.params;
    const userId = res.locals.userId;
    
    // Find the friendship
    const friendship = await sql`
      SELECT "ID_znajomych", "ID_uzytkownik1", "ID_uzytkownik2", status
      FROM "Znajomi"
      WHERE "ID_znajomych" = ${Number(id)}
    `;
    
    if (friendship.length === 0) {
      res.status(404).json({ error: 'Znajomy nie został znaleziony' });
      return;
    }
    
    // Ensure the current user is part of this friendship
    if (friendship[0].ID_uzytkownik1 !== userId && friendship[0].ID_uzytkownik2 !== userId) {
      res.status(403).json({ error: 'Nie masz uprawnień do usunięcia tego znajomego' });
      return;
    }
    
    // Delete the friendship record
    await sql`
      DELETE FROM "Znajomi"
      WHERE "ID_znajomych" = ${Number(id)}
    `;
    
    res.status(200).json({ success: true });
    return;
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas usuwania znajomego' });
    return;
  }
});

export default router;