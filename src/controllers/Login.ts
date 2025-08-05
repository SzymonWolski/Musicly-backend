// src/controllers/login.ts
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { sql } from 'bun';

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
    // 1. Pobierz użytkownika z bazy danych używając Bun.sql
    const users = await sql`
      SELECT "ID_uzytkownik" as id, email, haslo as password, "isAdmin" as isadmin, nick, 
             "profileImagePath" as "profileImagePath"
      FROM "Uzytkownik" 
      WHERE email = ${email}
    `;

    if (users.length === 0) {
      res.status(401).json({
        success: false,
        message: 'Nieprawidłowy email lub hasło'
      });
      return;
    }

    const user = users[0] as UserData;

    // 2. Weryfikacja hasła używając Bun.password
    const isPasswordValid = await Bun.password.verify(
      password, 
      user.password,
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
      { userId: user.id },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '20h' }
    );

    // 4. Zwrócenie odpowiedzi
    const { password: _, ...userWithoutPassword } = user;
    
    // Dodaj domyślne zdjęcie profilowe jeśli użytkownik go nie posiada
    const userResponse = {
      ...userWithoutPassword,
      profileImagePath: user.profileImagePath || '/uploads/user-images/default-profile.jpg'
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