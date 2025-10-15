import { Request, Response, Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authMiddleware';

const prisma = new PrismaClient();
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
  keyTimestamp: number;
}

// Get message history between current user and friend
router.get('/:friendId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number(req.userId);
    const friendId = Number(req.params.friendId);
    
    // Validate friendId
    if (isNaN(friendId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID znajomego' });
      return;
    }

    // Get messages between the two users (both sent and received)
    const messages = await prisma.wiadomosci.findMany({
      where: {
        OR: [
          {
            ID_nadawca: userId,
            ID_odbiorca: friendId
          },
          {
            ID_nadawca: friendId,
            ID_odbiorca: userId
          }
        ]
      },
      orderBy: {
        data_wyslania: 'asc'
      }
    });

    // Return messages with encrypted content and keyTimestamp for frontend decryption
    const formattedMessages = messages.map(msg => ({
      id: msg.ID_wiadomosci,
      sender: msg.ID_nadawca,
      recipient: msg.ID_odbiorca,
      content: msg.tresc,
      timestamp: msg.data_wyslania.toISOString(),
      read: msg.przeczytana,
      keyTimestamp: Number(msg.klucz_timestamp)
    }));

    // Auto-mark received messages as read
    if (messages.length > 0) {
      await prisma.wiadomosci.updateMany({
        where: {
          ID_odbiorca: userId,
          ID_nadawca: friendId,
          przeczytana: false
        },
        data: {
          przeczytana: true
        }
      });
    }

    res.status(200).json({ messages: formattedMessages });
    
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas pobierania wiadomości' });
  }
});

// Check for new messages since a specified message ID  
router.get('/:friendId/new', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number(req.userId);
    const friendId = Number(req.params.friendId);
    const afterId = Number(req.query.after || 0);
    
    // Validate parameters
    if (isNaN(friendId) || isNaN(afterId)) {
      res.status(400).json({ error: 'Nieprawidłowe parametry' });
      return;
    }

    // Get only messages newer than the specified ID
    const newMessages = await prisma.wiadomosci.findMany({
      where: {
        ID_wiadomosci: {
          gt: afterId
        },
        OR: [
          {
            ID_nadawca: userId,
            ID_odbiorca: friendId
          },
          {
            ID_nadawca: friendId,
            ID_odbiorca: userId
          }
        ]
      },
      orderBy: {
        data_wyslania: 'asc'
      }
    });

    // Return messages with encrypted content and keyTimestamp for frontend decryption
    const formattedMessages = newMessages.map(msg => ({
      id: msg.ID_wiadomosci,
      sender: msg.ID_nadawca,
      recipient: msg.ID_odbiorca,
      content: msg.tresc,
      timestamp: msg.data_wyslania.toISOString(),
      read: msg.przeczytana,
      keyTimestamp: Number(msg.klucz_timestamp)
    }));

    // Auto-mark received messages as read
    if (newMessages.length > 0) {
      await prisma.wiadomosci.updateMany({
        where: {
          ID_odbiorca: userId,
          ID_nadawca: friendId,
          przeczytana: false
        },
        data: {
          przeczytana: true
        }
      });
    }

    res.status(200).json({ messages: formattedMessages });
    
  } catch (error) {
    console.error('Error checking for new messages:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas sprawdzania nowych wiadomości' });
  }
});

// Send a new message
router.post('/send', async (req: Request, res: Response): Promise<void> => {
  try {
    const senderId = Number(req.userId);
    const { recipientId, encryptedContent, keyTimestamp } = req.body;
    
    // Validate input
    if (!recipientId || !encryptedContent || !keyTimestamp || typeof encryptedContent !== 'string' || encryptedContent.trim() === '') {
      res.status(400).json({ error: 'Brakujące lub nieprawidłowe dane wiadomości' });
      return;
    }

    // Validate keyTimestamp is a number
    if (typeof keyTimestamp !== 'number' || keyTimestamp <= 0) {
      res.status(400).json({ error: 'Nieprawidłowy timestamp klucza' });
      return;
    }

    // Validate recipient exists
    const recipient = await prisma.uzytkownik.findUnique({
      where: {
        ID_uzytkownik: Number(recipientId)
      }
    });
    
    if (!recipient) {
      res.status(404).json({ error: 'Odbiorca nie istnieje' });
      return;
    }

    // Create the message with encrypted content from frontend
    const newMessage = await prisma.wiadomosci.create({
      data: {
        ID_nadawca: senderId,
        ID_odbiorca: Number(recipientId),
        tresc: encryptedContent,
        przeczytana: false,
        klucz_timestamp: BigInt(keyTimestamp)
      }
    });

    // Return the created message with encrypted content and keyTimestamp
    const messageResponse = {
      id: newMessage.ID_wiadomosci,
      sender: newMessage.ID_nadawca,
      recipient: newMessage.ID_odbiorca,
      content: newMessage.tresc,
      timestamp: newMessage.data_wyslania.toISOString(),
      read: newMessage.przeczytana,
      keyTimestamp: Number(newMessage.klucz_timestamp)
    };
    
    res.status(201).json({ message: messageResponse });
    
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas wysyłania wiadomości' });
  }
});

// Mark messages as read
router.put('/read/:messageId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number(req.userId);
    const messageId = Number(req.params.messageId);
    
    // Validate messageId
    if (isNaN(messageId)) {
      res.status(400).json({ error: 'Nieprawidłowe ID wiadomości' });
      return;
    }

    // Check if the message exists and is addressed to the current user
    const message = await prisma.wiadomosci.findUnique({
      where: {
        ID_wiadomosci: messageId
      }
    });
    
    if (!message) {
      res.status(404).json({ error: 'Wiadomość nie istnieje' });
      return;
    }

    // Only allow the recipient to mark messages as read
    if (message.ID_odbiorca !== userId) {
      res.status(403).json({ error: 'Nie masz uprawnień do oznaczenia tej wiadomości jako przeczytanej' });
      return;
    }

    // Mark the message as read
    await prisma.wiadomosci.update({
      where: {
        ID_wiadomosci: messageId
      },
      data: {
        przeczytana: true
      }
    });

    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Wystąpił błąd podczas oznaczania wiadomości jako przeczytanej' });
  }
});

export default router;
