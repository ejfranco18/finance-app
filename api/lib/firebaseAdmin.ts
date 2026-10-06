import type { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { query } from './db';

declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        name?: string;
        picture?: string;
      };
    }
  }
}

const fallbackProjectId =
  process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

if (!getApps().length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      let rawSa = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      if (
        (rawSa.startsWith("'") && rawSa.endsWith("'")) ||
        (rawSa.startsWith('"') && rawSa.endsWith('"'))
      ) {
        rawSa = rawSa.slice(1, -1);
      }
      const serviceAccount = JSON.parse(rawSa);
      if (typeof serviceAccount.private_key === 'string') {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || fallbackProjectId,
      });
    } catch (error) {
      console.error('Error al parsear FIREBASE_SERVICE_ACCOUNT, usando projectId fallback:', error);
      initializeApp(fallbackProjectId ? { projectId: fallbackProjectId } : undefined);
    }
  } else {
    console.warn(
      '⚠️ FIREBASE_SERVICE_ACCOUNT no está definido en el entorno. Inicializando con projectId por defecto.'
    );
    initializeApp(fallbackProjectId ? { projectId: fallbackProjectId } : undefined);
  }
}

export const adminAuth = getAuth();

// Caché en memoria por clave (uid + email + name + picture) para evitar hacer UPSERT en cada request repetido
const syncedUsersCache = new Set<string>();

/**
 * Garantiza que el usuario autenticado en Firebase exista en las tablas `users`
 * y `user_settings` de Neon PostgreSQL antes de ejecutar cualquier operación.
 */
export async function ensureUserSynced(user: {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}): Promise<void> {
  const cacheKey = `${user.uid}|${user.email || ''}|${user.name || ''}|${user.picture || ''}`;
  if (syncedUsersCache.has(cacheKey)) {
    return;
  }

  const hasEmail = Boolean(user.email);
  const effectiveEmail = user.email || `${user.uid}@local.dev`;

  await query(
    `INSERT INTO users (id, email, display_name, photo_url, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       email = CASE WHEN $5::boolean THEN EXCLUDED.email ELSE users.email END,
       display_name = COALESCE(EXCLUDED.display_name, users.display_name),
       photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
       updated_at = CURRENT_TIMESTAMP`,
    [user.uid, effectiveEmail, user.name || null, user.picture || null, hasEmail]
  );

  await query(
    `INSERT INTO user_settings (user_id, main_currency, exchange_rate_cop_usd, ai_provider)
     VALUES ($1, 'COP', 3303.16, 'gemini')
     ON CONFLICT (user_id) DO NOTHING`,
    [user.uid]
  );

  syncedUsersCache.add(cacheKey);
}

/**
 * Middleware de autenticación que verifica el token JWT de Firebase Auth
 * enviado en `Authorization: Bearer <token>`, sincroniza el usuario en Neon DB
 * y asigna `req.user`.
 */
export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        picture: decodedToken.picture,
      };
      await ensureUserSynced(req.user);
      return next();
    } catch (error) {
      console.error('Error al verificar token de Firebase Auth:', error);
      return res.status(401).json({ error: 'Token de autenticación inválido o expirado.' });
    }
  }

  // En desarrollo local permite fallback a userId en body/params/header para scripts de prueba (ej. scripts/test-api.ts)
  if (process.env.NODE_ENV !== 'production') {
    const devUserId =
      (req.headers['x-user-id'] as string | undefined) ||
      req.body?.userId ||
      req.params?.userId;

    if (devUserId) {
      req.user = { uid: String(devUserId) };
      try {
        await ensureUserSynced(req.user);
      } catch (error) {
        console.error('Error al sincronizar usuario en modo desarrollo:', error);
      }
      return next();
    }
  }

  return res.status(401).json({ error: 'No autorizado. Se requiere header Authorization: Bearer <token>.' });
}