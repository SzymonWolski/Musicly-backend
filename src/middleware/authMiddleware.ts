import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Express Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

interface DecodedToken {
  userId: number;
  [key: string]: any;
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Authentication failed: No token provided or invalid format');
      res.status(401).json({ error: 'Brak autoryzacji' });
      return;
    }
    
    // Extract the token
    const token = authHeader.split(' ')[1];
    
    // Verify and decode token using the same secret as login
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'jakis_sekret') as DecodedToken;
    
    // Set user ID in both req.userId and res.locals for backward compatibility
    req.userId = decoded.userId;
    res.locals.userId = decoded.userId;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Niepoprawny token autoryzacyjny' });
  }
};

// New middleware: authenticate if token exists, but don't require it
export const optionalAuthenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    // If no token is provided, just continue without setting userId
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }
    
    // Extract the token
    const token = authHeader.split(' ')[1];
    
    try {
      // Verify and decode token
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'jakis_sekret') as DecodedToken;
      
      // Set user ID if token is valid
      req.userId = decoded.userId;
      res.locals.userId = decoded.userId;
    } catch (tokenError) {
      // If token verification fails, just continue without userId
      console.log('Optional authentication: Invalid token, continuing as guest');
    }
    
    next();
  } catch (error) {
    // In case of any other errors, continue as unauthenticated
    console.error('Error in optional authentication:', error);
    next();
  }
};
