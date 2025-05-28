import { Request, Response, Router } from 'express';
import { sql } from 'bun';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Apply authentication middleware to all message routes
router.use(authenticate);

interface Message {
  id: number;
  sender: number;
  recipient: number;
  content: string;
  timestamp: string;
  read: boolean;
}

// Get message history between current user and friend
router.get('/:friendId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const friendId = Number(req.params.friendId);
    
    // Validate friendId
    if (isNaN(friendId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID znajomego' });
      return;
    }

    // Get messages between the two users (both sent and received)
    const messages = await sql`
      SELECT 
        "ID_wiadomosci" as id,
        "ID_nadawca" as sender,
        "ID_odbiorca" as recipient,
        "tresc" as content,
        "data_wyslania" as timestamp,
        "przeczytana" as read
      FROM "Wiadomosci"
      WHERE 
        ("ID_nadawca" = ${userId} AND "ID_odbiorca" = ${friendId})
        OR
        ("ID_nadawca" = ${friendId} AND "ID_odbiorca" = ${userId})
      ORDER BY "data_wyslania" ASC
    `;

    // Auto-mark received messages as read
    if (messages.length > 0) {
      await sql`
        UPDATE "Wiadomosci"
        SET "przeczytana" = TRUE
        WHERE "ID_odbiorca" = ${userId} AND "ID_nadawca" = ${friendId} AND "przeczytana" = FALSE
      `;
    }

    res.status(200).json({ messages });
    
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania wiadomości' });
  }
});

// Check for new messages since a specified message ID
router.get('/:friendId/new', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const friendId = Number(req.params.friendId);
    const afterId = Number(req.query.after || 0);
    
    // Validate parameters
    if (isNaN(friendId) || isNaN(afterId)) {
      res.status(400).json({ error: 'Nieprawidłowe parametry' });
      return;
    }

    // Get only messages newer than the specified ID
    const newMessages = await sql`
      SELECT 
        "ID_wiadomosci" as id,
        "ID_nadawca" as sender,
        "ID_odbiorca" as recipient,
        "tresc" as content,
        "data_wyslania" as timestamp,
        "przeczytana" as read
      FROM "Wiadomosci"
      WHERE 
        (
          ("ID_nadawca" = ${userId} AND "ID_odbiorca" = ${friendId})
          OR
          ("ID_nadawca" = ${friendId} AND "ID_odbiorca" = ${userId})
        )
        AND "ID_wiadomosci" > ${afterId}
      ORDER BY "data_wyslania" ASC
    `;

    // Auto-mark received messages as read
    if (newMessages.length > 0) {
      await sql`
        UPDATE "Wiadomosci"
        SET "przeczytana" = TRUE
        WHERE "ID_odbiorca" = ${userId} AND "ID_nadawca" = ${friendId} AND "przeczytana" = FALSE
      `;
    }

    res.status(200).json({ messages: newMessages });
    
  } catch (error) {
    console.error('Error checking for new messages:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas sprawdzania nowych wiadomości' });
  }
});

// Send a new message
router.post('/send', async (req: Request, res: Response): Promise<void> => {
  try {
    const senderId = req.userId;
    const { recipientId, content } = req.body;
    
    // Validate input
    if (!recipientId || !content || typeof content !== 'string' || content.trim() === '') {
      res.status(400).json({ error: 'Brakujące lub nieprawidłowe dane wiadomości' });
      return;
    }

    // Validate recipient exists
    const recipient = await sql`
      SELECT "ID_uzytkownik" FROM "Uzytkownik"
      WHERE "ID_uzytkownik" = ${Number(recipientId)}
    `;
    
    if (recipient.length === 0) {
      res.status(404).json({ error: 'Odbiorca nie istnieje' });
      return;
    }

    // Create the message
    const result = await sql`
      INSERT INTO "Wiadomosci" (
        "ID_nadawca",
        "ID_odbiorca",
        "tresc",
        "data_wyslania",
        "przeczytana"
      )
      VALUES (
        ${senderId},
        ${Number(recipientId)},
        ${content},
        CURRENT_TIMESTAMP,
        FALSE
      )
      RETURNING 
        "ID_wiadomosci" as id,
        "ID_nadawca" as sender,
        "ID_odbiorca" as recipient,
        "tresc" as content,
        "data_wyslania" as timestamp,
        "przeczytana" as read
    `;

    // Return the created message
    const newMessage = result[0];
    res.status(201).json({ message: newMessage });
    
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas wysyłania wiadomości' });
  }
});

// Mark messages as read
router.put('/read/:messageId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const messageId = Number(req.params.messageId);
    
    // Validate messageId
    if (isNaN(messageId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID wiadomości' });
      return;
    }

    // Check if the message exists and is addressed to the current user
    const message = await sql`
      SELECT "ID_wiadomosci", "ID_odbiorca"
      FROM "Wiadomosci"
      WHERE "ID_wiadomosci" = ${messageId}
    `;
    
    if (message.length === 0) {
      res.status(404).json({ error: 'Wiadomość nie istnieje' });
      return;
    }

    // Only allow the recipient to mark messages as read
    if (message[0].ID_odbiorca !== userId) {
      res.status(403).json({ error: 'Nie masz uprawnień do oznaczenia tej wiadomości jako przeczytanej' });
      return;
    }

    // Mark the message as read
    await sql`
      UPDATE "Wiadomosci"
      SET "przeczytana" = TRUE
      WHERE "ID_wiadomosci" = ${messageId}
    `;

    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas oznaczania wiadomości jako przeczytanej' });
  }
});

export default router;
