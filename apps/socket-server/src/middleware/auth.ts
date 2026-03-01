import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

export interface AdminToken {
  role: 'admin';
  iat: number;
  exp: number;
}

export function verifyAdminToken(token: string): boolean {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AdminToken;
    return decoded.role === 'admin';
  } catch {
    return false;
  }
}

export function generateAdminToken(): string {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
}
