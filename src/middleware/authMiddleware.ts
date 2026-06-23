import { Request, Response, NextFunction } from 'express';
import { validateKey } from '../services/apiKeyService';

export interface AuthenticatedRequest extends Request {
  apiKeyData?: {
    id: number;
    tenant_id: number;
    rate_limit_per_minute: number;
  };
}

export const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
    return;
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const keyData = await validateKey(token);
    if (!keyData) {
      res.status(401).json({ error: 'Unauthorized: Invalid or expired API key' });
      return;
    }
    
    req.apiKeyData = keyData;
    next();
  } catch (error) {
    console.error('Authentication Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
