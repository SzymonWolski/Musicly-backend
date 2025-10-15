// src/controllers/login.ts
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface UserData {
  id: number;
  email: string;
  password: string;
  nick: string;
  isadmin: boolean;
  profileImagePath?: string;
}

export const login = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ 
      success: false,
      errors: errors.array(),
      message: 'Nieprawidłowe dane wejściowe'
    });
    return;
  }

  const { email, password } = req.body;

  try {
    const user = await prisma.uzytkownik.findFirst({
      where: {
        email: email
      },
      select: {
        ID_uzytkownik: true,
        email: true,
        haslo: true,
        nick: true,
        isAdmin: true,
        profileImagePath: true
      }
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Nieprawidłowy email lub hasło'
      });
      return;
    }

    // Mapowanie danych do oczekiwanej struktury
    const userData: UserData = {
      id: user.ID_uzytkownik,
      email: user.email,
      password: user.haslo,
      nick: user.nick,
      isadmin: user.isAdmin,
      profileImagePath: user.profileImagePath ?? undefined
    };

    // 2. Weryfikacja hasła używając Bun.password
    const isPasswordValid = await Bun.password.verify(
      password, 
      userData.password,
      "bcrypt"
    );
    
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: 'Nieprawidłowy email lub hasło'
      });
      return;
    }

    // 3. Generowanie tokena JWT
    const token = jwt.sign(
      { userId: userData.id },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '20h' }
    );

    // 4. Zwrócenie odpowiedzi
    const { password: _, ...userWithoutPassword } = userData;
    
    // Dodaj domyślne zdjęcie profilowe jeśli użytkownik go nie posiada
    const userResponse = {
      ...userWithoutPassword,
      profileImagePath: userData.profileImagePath || '/uploads/user-images/default-profile.jpg'
    };
    
    res.json({
      success: true,
      token,
      user: userResponse,
      expiresIn: 3600
    });

  } catch (error) {
    console.error('Błąd logowania:', error);
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas logowania'
    });
  }
};

export const loginValidators = [
  body('email').isEmail().withMessage('Podaj poprawny adres email'),
  body('password').notEmpty().withMessage('Hasło jest wymagane')
];