// src/middleware/authenticateToken.ts
import { Request, Response, NextFunction } from 'express';

export function authenticateToken(
    req: Request,
    res: Response,
    next: NextFunction
) {
    if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}
