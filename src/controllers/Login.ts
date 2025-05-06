import { sql } from 'bun';
import { Request, Response } from 'express';

interface LoginRequestBody {
  email: string;
  password: string;
}

interface ValidationErrors {
  email?: string;
  password?: string;
  [key: string]: string | undefined;
}

interface UserData {
  id: number;
  nick: string;
  email: string;
}

/**
 * User login controller
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password }: LoginRequestBody = req.body;
  const errors: ValidationErrors = {};

  // Walidacja danych wejściowych
  if (!email || !password) {
    res.status(400).json({ 
      success: false, 
      errors: { 
        general: 'Email i hasło są wymagane' 
      } 
    });
    return;
  }

  try {
    // 1. Znajdź użytkownika po emailu
    const user = await sql`
      SELECT "ID_uzytkownik" as id, nick, email, haslo as password 
      FROM "Uzytkownik" 
      WHERE email = ${email}
    `;

    // 2. Jeśli użytkownik nie istnieje
    if (user.length === 0) {
      res.status(401).json({
        success: false,
        errors: {
          email: 'Nie znaleziono użytkownika o podanym emailu'
        }
      });
      return;
    }

    // 3. Sprawdź hasło
    const passwordMatch = await Bun.password.verify(
      password,
      user[0].password,
      "bcrypt"
    );

    if (!passwordMatch) {
      res.status(401).json({
        success: false,
        errors: {
          password: 'Nieprawidłowe hasło'
        }
      });
      return;
    }

    // 4. Przygotuj dane użytkownika do zwrócenia (bez hasła)
    const userData: UserData = {
      id: user[0].id,
      nick: user[0].nick,
      email: user[0].email
    };

    // 5. Zwróć sukces
    res.json({
      success: true,
      message: 'Logowanie zakończone sukcesem',
      user: userData,
      // Tutaj możesz dodać token JWT jeśli używasz autentykacji tokenowej
      // token: generateToken(userData)
    });

  } catch (error: unknown) {
    console.error('Błąd logowania:', error);
    res.status(500).json({ 
      success: false,
      message: 'Wystąpił błąd podczas logowania'
    });
  }
};