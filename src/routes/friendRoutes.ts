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

// Search users by nickname, email, or ID
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = res.locals.userId;
    const { query, searchType } = req.query;
    
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query parameter jest wymagany' });
      return;
    }
    
    let users;
    
    if (searchType === 'id') {
      // Search by ID - find all users whose ID contains the search digits
      const searchDigits = query.trim();
      
      // Validate that the query contains only digits
      if (!/^\d+$/.test(searchDigits)) {
        res.status(400).json({ error: 'Wyszukiwanie po ID wymaga tylko cyfr' });
        return;
      }
      
      // Search for users whose ID contains the search digits
      users = await sql`
        SELECT "ID_uzytkownik", "nick", "email"
        FROM "Uzytkownik"
        WHERE "ID_uzytkownik"::text LIKE ${`%${searchDigits}%`}
        AND "ID_uzytkownik" != ${userId}
        ORDER BY "ID_uzytkownik" ASC
        LIMIT 50
      `;
    } else {
      // Search by nickname or email (existing functionality)
      const searchTerm = `%${query.toLowerCase()}%`;
      
      users = await sql`
        SELECT "ID_uzytkownik", "nick", "email"
        FROM "Uzytkownik"
        WHERE (
          LOWER("nick") LIKE ${searchTerm} OR 
          LOWER("email") LIKE ${searchTerm}
        )
        AND "ID_uzytkownik" != ${userId}
        ORDER BY "nick" ASC
        LIMIT 50
      `;
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
    const { recipientId } = req.body;
    const senderId = res.locals.userId;
    
    const result = await sql`
      CALL friend_req(${senderId}, ${Number(recipientId)}, NULL, NULL, NULL);
    `;
    
    // Get the out parameters
    const status_code = result[0].status_code;
    const message = result[0].message;
    const friendship_id = result[0].friendship_id;
    
    if (status_code >= 400) {
      // If it's a 400 error about an incoming request, include the friendship_id
      if (message.includes('Ten użytkownik już wysłał Ci zaproszenie')) {
        res.status(status_code).json({
          error: message,
          status: 'incoming',
          friendshipId: friendship_id
        });
        return;
      } else if (message.includes('Wysłałeś już zaproszenie')) {
        res.status(status_code).json({
          error: message,
          status: 'outgoing'
        });
        return;
      } else {
        res.status(status_code).json({ error: message });
        return;
      }
    }

    res.status(status_code).json({ success: true, friendshipId: friendship_id });
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