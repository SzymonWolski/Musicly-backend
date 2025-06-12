import { Request, Response } from 'express';
import { Router } from 'express';
import { sql } from 'bun';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Apply authentication middleware to all user routes
router.use(authenticate);

// Get all users - only admins should have access
router.get('/list', async (req: Request, res: Response): Promise<void> => {
  try {
    // Get user ID from middleware
    const userId = res.locals.userId;
    
    // Check if the requester is an admin
    const adminCheck = await sql`
      SELECT "isAdmin" FROM "Uzytkownik"
      WHERE "ID_uzytkownik" = ${userId}
    `;
    
    if (adminCheck.length === 0 || !adminCheck[0].isAdmin) {
      res.status(403).json({ error: 'Nie masz uprawnień do wyświetlania listy użytkowników' });
      return;
    }
    
    // Fetch all users
    const users = await sql`
      SELECT "ID_uzytkownik", "email", "nick", "isAdmin" as "isadmin"
      FROM "Uzytkownik"
      ORDER BY "ID_uzytkownik"
    `;
    
    res.status(200).json({ users });
    return;
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania użytkowników' });
    return;
  }
});

// Toggle admin status for a user - only admins should have access
router.put('/toggleAdmin/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { isAdmin } = req.body;
    const requesterId = res.locals.userId;
    
    // Check if the requester is an admin
    const adminCheck = await sql`
      SELECT "isAdmin" FROM "Uzytkownik"
      WHERE "ID_uzytkownik" = ${requesterId}
    `;
    
    if (adminCheck.length === 0 || !adminCheck[0].isAdmin) {
      res.status(403).json({ error: 'Nie masz uprawnień do zmiany statusu administratora' });
      return;
    }
    
    // Don't allow changing your own admin status
    if (Number(userId) === Number(requesterId)) {
      res.status(400).json({ error: 'Nie możesz zmienić własnych uprawnień administratora' });
      return;
    }
    
    // Check if target user exists
    const targetUser = await sql`
      SELECT "ID_uzytkownik" FROM "Uzytkownik"
      WHERE "ID_uzytkownik" = ${Number(userId)}
    `;
    
    if (targetUser.length === 0) {
      res.status(404).json({ error: 'Użytkownik nie istnieje' });
      return;
    }
    
    // Update admin status
    await sql`
      UPDATE "Uzytkownik"
      SET "isAdmin" = ${isAdmin}
      WHERE "ID_uzytkownik" = ${Number(userId)}
    `;
    
    res.status(200).json({ 
      success: true, 
      message: `Status administratora użytkownika został ${isAdmin ? 'nadany' : 'odebrany'}` 
    });
    return;
  } catch (error) {
    console.error('Error toggling admin status:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas zmiany uprawnień administratora' });
    return;
  }
});

// Delete a user - only admins should have access
router.delete('/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requesterId = res.locals.userId;
    
    // Check if the requester is an admin
    const adminCheck = await sql`
      SELECT "isAdmin" FROM "Uzytkownik"
      WHERE "ID_uzytkownik" = ${requesterId}
    `;
    
    if (adminCheck.length === 0 || !adminCheck[0].isAdmin) {
      res.status(403).json({ error: 'Nie masz uprawnień do usuwania użytkowników' });
      return;
    }
    
    // Don't allow deleting yourself
    if (Number(userId) === Number(requesterId)) {
      res.status(400).json({ error: 'Nie możesz usunąć własnego konta' });
      return;
    }
    
    // Check if target user exists
    const targetUser = await sql`
      SELECT "ID_uzytkownik", "nick" FROM "Uzytkownik"
      WHERE "ID_uzytkownik" = ${Number(userId)}
    `;
    
    if (targetUser.length === 0) {
      res.status(404).json({ error: 'Użytkownik nie istnieje' });
      return;
    }
    
    // Start a transaction to delete the user and all related data
    await sql.begin(async (transaction) => {
      // Delete related data in proper order to avoid foreign key constraints
      // Delete from Polubienia
      await transaction`
        DELETE FROM "Polubienia" 
        WHERE "ID_uzytkownik" = ${Number(userId)}
      `;
      
      // Delete from PlaylistaUtwor for user's playlists
      await transaction`
        DELETE FROM "PlaylistaUtwor" 
        WHERE "ID_playlisty" IN (
          SELECT "ID_playlisty" FROM "Playlista" WHERE "ID_uzytkownik" = ${Number(userId)}
        )
      `;
      
      // Delete from Playlista
      await transaction`
        DELETE FROM "Playlista" 
        WHERE "ID_uzytkownik" = ${Number(userId)}
      `;
      
      // Delete from Znajomi where user is either party
      await transaction`
        DELETE FROM "Znajomi" 
        WHERE "ID_uzytkownik1" = ${Number(userId)} OR "ID_uzytkownik2" = ${Number(userId)}
      `;
      
      // Delete from Wiadomosci where user is either sender or recipient
      await transaction`
        DELETE FROM "Wiadomosci" 
        WHERE "ID_nadawca" = ${Number(userId)} OR "ID_odbiorca" = ${Number(userId)}
      `;
      
      // Finally delete the user
      await transaction`
        DELETE FROM "Uzytkownik" 
        WHERE "ID_uzytkownik" = ${Number(userId)}
      `;
    });
    
    res.status(200).json({ 
      success: true, 
      message: `Użytkownik "${targetUser[0].nick}" został pomyślnie usunięty` 
    });
    return;
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      error: 'Wystąpił błąd podczas usuwania użytkownika',
      details: error instanceof Error ? error.message : String(error)
    });
    return;
  }
});

export default router;
