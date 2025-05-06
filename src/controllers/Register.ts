import { sql } from 'bun';
import { Request, Response } from 'express';

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

  // 1. Dodaj walidację danych wejściowych
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
    const nickCheck = await sql`
      SELECT * FROM "Uzytkownik" WHERE nick = ${nick}
    `;
    if (nickCheck.length > 0) {
      errors.nick = 'Nazwa użytkownika jest już zajęta';
    }

    // Sprawdź unikalność emaila
    const emailCheck = await sql`
      SELECT * FROM "Uzytkownik" WHERE email = ${email}
    `;
    if (emailCheck.length > 0) {
      errors.email = 'Email jest już zarejestrowany';
    }

    // Jeśli są błędy, zwróć je
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ success: false, errors });
      return;
    }

    // Hashowanie hasła
    const saltRounds = 10;
    const hashedPassword = await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: saltRounds
    });

    // 2. Debugowanie wartości przed wstawieniem
    console.log('Wartości do wstawienia:', { email, nick, hashedPassword });

    // 3. Poprawione zapytanie SQL z szczegółowo określoną składnią
    const newUser = await sql`
      INSERT INTO "Uzytkownik" (email, nick, haslo) 
      VALUES (${email || ''}, ${nick || ''}, ${hashedPassword || ''}) 
      RETURNING "ID_uzytkownik" as id, nick, email
    `;

    res.json({ 
      success: true,
      message: 'Rejestracja zakończona sukcesem',
      user: newUser[0] as UserData
    });

  } catch (error: unknown) {
    console.error('Błąd rejestracji:', error);
    res.status(500).json({ 
      success: false,
      message: 'Wystąpił błąd podczas rejestracji'
    });
  }
};
