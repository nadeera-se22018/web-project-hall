import 'dotenv/config';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import keys from './keys.js';

const JWT_ISSUER = process.env.JWT_ISSUER || 'http://localhost:5000';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'http://localhost:5173';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedPasswordHash) {
  if (!storedPasswordHash) return false;
  const [salt, hash] = storedPasswordHash.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

export async function sendOTP(email) {
  if (!email || !email.includes('@')) {
    throw new Error('Invalid email address');
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db('otps').insert({ email, code, expires_at: expiresAt });

  console.log(`\n🔑 OTP for ${email}: ${code}\n`);

  return { message: 'OTP sent successfully (check backend console)' };
}

export async function verifyOTP(email, code) {
  const otp = await db('otps')
    .where({ email, code })
    .andWhere('expires_at', '>', db.fn.now())
    .andWhere({ used: false })
    .orderBy('created_at', 'desc')
    .first();

  if (!otp) throw new Error('Invalid or expired OTP');

  await db('otps').where({ id: otp.id }).update({ used: true });

  let user = await db('users').where({ email }).first();

  if (!user) {
    [user] = await db('users').insert({ email, role_id: 3 }).returning('*');
  }

  return generateTokenSet(user);
}

export async function signupWithPassword(email, password, roleId = 3) {
  if (!email || !email.includes('@')) throw new Error('Invalid email address');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters long');

  const user = await db('users').where({ email }).first();
  
  if (user) {
    if (!user.password_hash) {
      const pHash = hashPassword(password);
      const [updatedUser] = await db('users')
        .where({ id: user.id })
        .update({ password_hash: pHash })
        .returning('*');
      return generateTokenSet(updatedUser);
    }
    throw new Error('Email address is already registered');
  }

  const pHash = hashPassword(password);
  const [newUser] = await db('users').insert({ email, password_hash: pHash, role_id: roleId }).returning('*');

  return generateTokenSet(newUser);
}

export async function loginWithPassword(email, password) {
  if (!email || !password) throw new Error('Email and password are required');

  const user = await db('users').where({ email }).first();
  if (!user) throw new Error('Invalid email or password');
  
  if (!user.password_hash) {
    throw new Error('This account was created without a password. Please log in using Magic OTP.');
  }

  const isValid = verifyPassword(password, user.password_hash);
  if (!isValid) throw new Error('Invalid email or password');

  return generateTokenSet(user);
}

export async function refreshTokens(refreshToken) {
  if (!refreshToken) throw new Error('Refresh token is required');

  const dbToken = await db('refresh_tokens')
    .where({ token: refreshToken })
    .andWhere('expires_at', '>', db.fn.now())
    .whereNull('revoked_at')
    .first();

  if (!dbToken) throw new Error('Invalid, expired, or revoked refresh token');

  const user = await db('users').where({ id: dbToken.user_id }).first();
  if (!user) throw new Error('User not found');

  await db('refresh_tokens').where({ id: dbToken.id }).update({ revoked_at: db.fn.now() });

  return generateTokenSet(user);
}

export async function revokeToken(refreshToken) {
  if (!refreshToken) throw new Error('Token is required for revocation');

  const updatedRows = await db('refresh_tokens')
    .where({ token: refreshToken })
    .whereNull('revoked_at')
    .update({ revoked_at: db.fn.now() });

  if (updatedRows === 0) return { message: 'Token already revoked or not found' };
  return { message: 'Token successfully revoked' };
}

async function getUserRolesAndPermissions(userId) {
  const result = await db('users as u')
    .leftJoin('roles as r', 'u.role_id', 'r.id')
    .leftJoin('role_permissions as rp', 'r.id', 'rp.role_id')
    .leftJoin('permissions as p', 'rp.permission_id', 'p.id')
    .select('u.email', 'r.name as role_name')
    .select(db.raw(`COALESCE(ARRAY_AGG(p.name) FILTER (WHERE p.name IS NOT NULL), '{}') as permissions`))
    .where('u.id', userId)
    .groupBy('u.id', 'u.email', 'r.name')
    .first();

  return result || null;
}

export async function generateTokenSet(user) {
  const payload = await getUserRolesAndPermissions(user.id);
  const permissions = payload ? payload.permissions : [];
  const role = payload ? payload.role_name : 'student';

  const jwtOptions = {
    algorithm: 'RS256',
    expiresIn: '15m',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    keyid: 'key-1',
  };

  const accessTokenClaims = {
    sub: String(user.id),
    email: user.email,
    role: role,
    permissions: permissions,
  };
  const accessToken = jwt.sign(accessTokenClaims, keys.privateKey, jwtOptions);

  const idTokenClaims = {
    sub: String(user.id),
    email: user.email,
    email_verified: true,
  };
  const idToken = jwt.sign(idTokenClaims, keys.privateKey, jwtOptions);

  const refreshTokenString = crypto.randomBytes(40).toString('hex');
  const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db('refresh_tokens').insert({
    token: refreshTokenString,
    user_id: user.id,
    expires_at: refreshTokenExpiry
  });

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 900,
    refresh_token: refreshTokenString,
    id_token: idToken,
  };
}
