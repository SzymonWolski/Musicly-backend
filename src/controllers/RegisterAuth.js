// Endpoint rejestracji
/*app.post('/auth/register', async (req, res) => {
  const { firstName, lastName, username, email, password } = req.body;
  const errors = {};

  try {
    // Sprawdź unikalność nazwy użytkownika
    const usernameCheck = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    if (usernameCheck.rows.length > 0) {
      errors.username = 'Nazwa użytkownika jest już zajęta';
    }

    // Sprawdź unikalność emaila
    const emailCheck = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    if (emailCheck.rows.length > 0) {
      errors.email = 'Email jest już zarejestrowany';
    }

    // Jeśli są błędy, zwróć je
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // Hashowanie hasła
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Dodanie nowego użytkownika do bazy
    const newUser = await pool.query(
      'INSERT INTO users (first_name, last_name, username, email, password) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email',
      [firstName, lastName, username, email, hashedPassword]
    );

    res.json({ 
      success: true,
      message: 'Rejestracja zakończona sukcesem',
      user: newUser.rows[0]
    });

  } catch (error) {
    console.error('Błąd rejestracji:', error);
    res.status(500).json({ 
      success: false,
      message: 'Wystąpił błąd podczas rejestracji'
    });
  }
});*/