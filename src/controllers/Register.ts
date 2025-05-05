import { sql } from 'bun';
import { Request, Response } from 'express';

interface RegisterRequestBody {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

interface ValidationErrors {
  username?: string;
  email?: string;
  [key: string]: string | undefined;
}

interface UserData {
  id: number;
  username: string;
  email: string;
}

/**
 * User registration controller
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  const { firstName, lastName, username, email, password }: RegisterRequestBody = req.body;
  const errors: ValidationErrors = {};

  try {
    // Sprawdź unikalność nazwy użytkownika
    const usernameCheck = await sql`
      SELECT * FROM users WHERE username = ${username}
    `;
    if (usernameCheck.length > 0) {
      errors.username = 'Nazwa użytkownika jest już zajęta';
    }

    // Sprawdź unikalność emaila
    const emailCheck = await sql`
      SELECT * FROM users WHERE email = ${email}
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

    // Dodanie nowego użytkownika do bazy
    const newUser = await sql`
      INSERT INTO users (first_name, last_name, username, email, password) 
      VALUES (${firstName}, ${lastName}, ${username}, ${email}, ${hashedPassword}) 
      RETURNING id, username, email
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
