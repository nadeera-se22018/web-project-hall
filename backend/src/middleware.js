import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import keys from './keys.js';
import { db } from './db.js';

const auth0Domain = process.env.AUTH0_DOMAIN;
const jwksClient = auth0Domain
  ? jwksRsa({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      jwksUri: `https://${auth0Domain}/.well-known/jwks.json`,
    })
  : null;

async function getSigningKey(kid) {
  if (!jwksClient || !kid) return null;
  try {
    const key = await jwksClient.getSigningKey(kid);
    return key.getPublicKey();
  } catch {
    return null;
  }
}

async function resolveDbUser(decoded) {
  const sub = decoded.sub;
  const email = decoded.email || decoded['https://projecthall.com/email'];
  const name = decoded.name || decoded.nickname || email;
  const picture = decoded.picture || decoded.avatar_url || null;

  let user = null;

  if (Number.isInteger(Number(sub)) && !String(sub).includes('|')) {
    user = await db('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .where('u.id', parseInt(sub, 10))
      .select('u.*', 'r.name as role_name')
      .first();
  }

  if (!user && sub) {
    user = await db('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .where('u.google_id', sub)
      .select('u.*', 'r.name as role_name')
      .first();
  }

  if (!user && email) {
    user = await db('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .where('u.email', email)
      .select('u.*', 'r.name as role_name')
      .first();

    if (user && !user.google_id && sub) {
      await db('users').where({ id: user.id }).update({ google_id: sub });
      user.google_id = sub;
    }
  }

  if (!user && email) {
    const [newUser] = await db('users')
      .insert({
        email,
        name,
        avatar_url: picture,
        google_id: sub,
        role_id: 3,
      })
      .onConflict('email')
      .merge(['name', 'avatar_url', 'google_id'])
      .returning('*');

    user = await db('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .where('u.id', newUser.id)
      .select('u.*', 'r.name as role_name')
      .first();
  }

  return user;
}

export const authenticateToken = async (req, res, next) => {
  let token = req.cookies?.access_token;
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decodedUnverified = jwt.decode(token, { complete: true });
    if (!decodedUnverified) {
      return res.status(403).json({ error: 'Invalid access token format' });
    }

    let verifiedUser = null;
    const headerKid = decodedUnverified.header?.kid;
    const isAuth0 = decodedUnverified.payload?.iss && auth0Domain && decodedUnverified.payload.iss.includes(auth0Domain);

    if (isAuth0 && headerKid) {
      const signingKey = await getSigningKey(headerKid);
      if (signingKey) {
        verifiedUser = jwt.verify(token, signingKey, { algorithms: ['RS256'] });
      }
    }

    if (!verifiedUser) {
      try {
        verifiedUser = jwt.verify(token, keys.publicKey, { algorithms: ['RS256'] });
      } catch (localErr) {
        if (headerKid && jwksClient) {
          const fallbackKey = await getSigningKey(headerKid);
          if (fallbackKey) {
            verifiedUser = jwt.verify(token, fallbackKey, { algorithms: ['RS256'] });
          }
        }
        if (!verifiedUser) {
          throw localErr;
        }
      }
    }

    const dbUser = await resolveDbUser(verifiedUser);
    const userId = dbUser ? dbUser.id : (Number.isInteger(Number(verifiedUser.sub)) ? parseInt(verifiedUser.sub, 10) : null);

    let permissions = verifiedUser.permissions || [];
    if (userId) {
      const perms = await db('role_permissions as rp')
        .join('permissions as p', 'rp.permission_id', 'p.id')
        .where('rp.role_id', dbUser?.role_id || 3)
        .select('p.name');
      permissions = Array.from(new Set([...permissions, ...perms.map(p => p.name)]));
    }

    req.user = {
      ...verifiedUser,
      dbId: userId,
      sub: userId ? String(userId) : verifiedUser.sub,
      auth0Sub: verifiedUser.sub,
      role: dbUser?.role_name || verifiedUser.role || 'student',
      permissions,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ error: 'Invalid access token' });
  }
};

export const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    if (!req.user || !req.user.sub) {
      return res.status(401).json({ error: 'Unauthorized: User not authenticated' });
    }

    const userPermissions = req.user.permissions || [];
    if (userPermissions.includes(permissionName)) {
      return next();
    }

    try {
      const userId = req.user.dbId || parseInt(req.user.sub, 10);
      if (userId) {
        const dbCheck = await db('users as u')
          .join('role_permissions as rp', 'u.role_id', 'rp.role_id')
          .join('permissions as p', 'rp.permission_id', 'p.id')
          .where('u.id', userId)
          .andWhere('p.name', permissionName)
          .first(db.raw('1 as exists'));

        if (dbCheck) {
          return next();
        }
      }

      return res.status(403).json({ error: `Forbidden: Missing required permission '${permissionName}'` });
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error checking permissions' });
    }
  };
};

export const requireRole = (roleName) => {
  return async (req, res, next) => {
    if (!req.user || !req.user.sub) {
      return res.status(401).json({ error: 'Unauthorized: User not authenticated' });
    }

    if (req.user.role === roleName) {
      return next();
    }

    try {
      const userId = req.user.dbId || parseInt(req.user.sub, 10);
      if (userId) {
        const role = await db('users as u')
          .join('roles as r', 'u.role_id', 'r.id')
          .where('u.id', userId)
          .select('r.name')
          .first();

        if (role && role.name === roleName) {
          return next();
        }
      }

      return res.status(403).json({ error: `Forbidden: Requires role '${roleName}'` });
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error checking role' });
    }
  };
};

export const requireProjectOwnership = async (req, res, next) => {
  const projectId = parseInt(req.params.id, 10);
  const userId = req.user.dbId || parseInt(req.user.sub, 10);

  if (!projectId || !userId) {
    return res.status(403).json({ error: 'Access denied: Invalid project or user identifier' });
  }

  try {
    const project = await db('projects').where({ id: projectId }).first();
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.created_by !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access forbidden: You can only modify or delete your own submissions' });
    }

    next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify project ownership' });
  }
};
