import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RegisterRequestBody {
  nick: string;
  email: string;
  password: string;
}

interface ValidationErrors {
  nick?: string;
  email?: string;
  password?: string;
  [key: string]: string | undefined;
}

interface UserData {
  id: number;
  nick: string;
  email: string;
  password: string;
}

/**
 * User registration controller
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  console.log('Rejestracja użytkownika:', req.body);
  const {nick, email, password }: RegisterRequestBody = req.body;
  const errors: ValidationErrors = {};

  if (!nick || !email || !password) {
    res.status(400).json({ 
      success: false, 
      errors: { 
        general: 'Wszystkie pola są wymagane' 
      } 
    });
    return;
  }

  try {
    // Sprawdź unikalność nazwy użytkownika
    const nickCheck = await prisma.uzytkownik.findFirst({
      where: {
        nick: nick
      }
    });
    
    if (nickCheck) {
      errors.nick = 'Nazwa użytkownika jest już zajęta';
    }

    // Sprawdź unikalność emaila
    const emailCheck = await prisma.uzytkownik.findFirst({
      where: {
        email: email
      }
    });
    
    if (emailCheck) {
      errors.email = 'Email jest już zarejestrowany';
    }

    // Jeśli są błędy, zwróć je
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ success: false, errors });
      return;
    }

    // sprawdź czy to pierwsze konto w tabeli — jeśli tak, nadaj uprawnienia admina
    const existingUsersCount = await prisma.uzytkownik.count();
    const makeAdmin = existingUsersCount === 0;

    // Hashowanie hasła
    const saltRounds = 10;
    const hashedPassword = await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: saltRounds
    });

    console.log('Wartości do wstawienia:', { email, nick, hashedPassword });

    const newUser = await prisma.uzytkownik.create({
      data: {
        email: email,
        nick: nick,
        haslo: hashedPassword,
        isAdmin: makeAdmin
      },
      select: {
        ID_uzytkownik: true,
        nick: true,
        email: true
      }
    });

    res.json({ 
      success: true,
      message: 'Rejestracja zakończona sukcesem',
      user: {
        id: newUser.ID_uzytkownik,
        nick: newUser.nick,
        email: newUser.email
      }
    });

  } catch (error: unknown) {
    console.error('Błąd rejestracji:', error);
    res.status(500).json({ 
      success: false,
      message: 'Wystąpił błąd podczas rejestracji'
    });
  } finally {
    await prisma.$disconnect();
  }
};
