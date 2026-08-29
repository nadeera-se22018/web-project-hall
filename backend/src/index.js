import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

import fs from 'fs';
import cookieParser from 'cookie-parser';

import { initializeDatabase, db } from './db.js';
import keys from './keys.js';
import {
  sendOTP,
  verifyOTP,
  signupWithPassword,
  loginWithPassword,
  refreshTokens,
  revokeToken,
  generateTokenSet,
} from './auth.js';
import { authenticateToken } from './middleware.js';

// Route modules
import projectsRouter from './routes/projects.js';
import usersRouter    from './routes/users.js';
import adminRouter    from './routes/admin.js';

const app          = express();
const PORT         = process.env.PORT || 5000;
const JWT_ISSUER   = process.env.JWT_ISSUER   || 'http://localhost:5000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Determine uploads directory dynamically (Docker volume vs local fallback)
const UPLOADS_DIR = process.env.UPLOADS_DIR || 
  (fs.existsSync('/app/uploads') ? '/app/uploads' : path.join(process.cwd(), 'uploads'));

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ----------------------------------------------------------------
// Core Middleware
// ----------------------------------------------------------------
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const setAuthCookies = (res, tokenSet) => {
  res.cookie('access_token', tokenSet.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000, // 15 mins
  });

  res.cookie('refresh_token', tokenSet.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// Serve uploaded thumbnails as static files
app.use('/uploads', express.static(UPLOADS_DIR));

// Session — only for the Google OAuth round-trip (5-min cookie)
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 5 * 60 * 1000 },
}));

app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ----------------------------------------------------------------
// Google OAuth2 Strategy
// ----------------------------------------------------------------
passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID || 'mock-client-id',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'mock-client-secret',
    callbackURL:  process.env.GOOGLE_CALLBACK_URL,
  },
  async (_at, _rt, profile, done) => {
    try {
      const email      = profile.emails?.[0]?.value;
      const name       = profile.displayName || null;
      const avatar_url = profile.photos?.[0]?.value || null;
      const google_id  = profile.id;

      if (!email) return done(new Error('No email returned from Google'));

      let user = await db('users').where({ google_id: profile.id }).first();
      
      if (!user) {
        [user] = await db('users')
          .insert({ email, name, avatar_url, google_id, role_id: 3 })
          .onConflict('email')
          .merge(['name', 'avatar_url', 'google_id'])
          .returning('*');
      }
      
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// ----------------------------------------------------------------
// Auth — Public Endpoints
// ----------------------------------------------------------------
app.post('/api/auth/otp/send', async (req, res) => {
  try { res.json(await sendOTP(req.body.email)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/auth/otp/verify', async (req, res) => {
  try {
    const tokens = await verifyOTP(req.body.email, req.body.code);
    setAuthCookies(res, tokens);
    res.json({ message: 'OTP verification successful' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const tokens = await signupWithPassword(req.body.email, req.body.password, req.body.role_id || 3);
    setAuthCookies(res, tokens);
    res.status(201).json({ message: 'Signup successful' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const tokens = await loginWithPassword(req.body.email, req.body.password);
    setAuthCookies(res, tokens);
    res.json({ message: 'Login successful' });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const rfToken = req.cookies.refresh_token;
    const tokens = await refreshTokens(rfToken);
    setAuthCookies(res, tokens);
    res.json({ message: 'Tokens refreshed successfully' });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

app.post('/api/auth/revoke', async (req, res) => {
  try {
    const rfToken = req.cookies.refresh_token;
    if (rfToken) {
      await revokeToken(rfToken);
    }
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.json({ message: 'Token successfully revoked' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ----------------------------------------------------------------
// Google OAuth Routes
// ----------------------------------------------------------------
app.get('/api/auth/google',
  passport.authenticate('google', { scope: ['openid', 'email', 'profile'] })
);

app.get('/api/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}?error=google_auth_failed` }),
  async (req, res) => {
    try {
      const tokenSet = await generateTokenSet(req.user);
      setAuthCookies(res, tokenSet);
      res.redirect(`${FRONTEND_URL}/auth/callback`);
    } catch (err) {
      res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    }
  }
);

// ----------------------------------------------------------------
// OIDC Discovery & JWKS
// ----------------------------------------------------------------
app.get('/api/auth/.well-known/openid-configuration', (_req, res) => {
  res.json({
    issuer: JWT_ISSUER,
    jwks_uri: `${JWT_ISSUER}/api/auth/jwks.json`,
    authorization_endpoint: `${JWT_ISSUER}/api/auth/google`,
    token_endpoint: `${JWT_ISSUER}/api/auth/token`,
    userinfo_endpoint: `${JWT_ISSUER}/api/auth/me`,
    end_session_endpoint: `${JWT_ISSUER}/api/auth/revoke`,
    id_token_signing_alg_values_supported: ['RS256'],
    subject_types_supported: ['public'],
    response_types_supported: ['code', 'token', 'id_token'],
    scopes_supported: ['openid', 'email', 'profile'],
    claims_supported: ['iss', 'sub', 'aud', 'exp', 'iat', 'email', 'email_verified', 'name', 'picture'],
  });
});

app.get('/api/auth/jwks.json', (_req, res) => {
  res.json({ keys: [keys.jwk] });
});

// ----------------------------------------------------------------
// Profile
// ----------------------------------------------------------------
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .leftJoin('role_permissions as rp', 'r.id', 'rp.role_id')
      .leftJoin('permissions as p', 'rp.permission_id', 'p.id')
      .select('u.id', 'u.email', 'u.name', 'u.avatar_url', 'r.name as role')
      .select(db.raw(`COALESCE(ARRAY_AGG(p.name) FILTER (WHERE p.name IS NOT NULL), '{}') as permissions`))
      .where('u.id', parseInt(req.user.sub, 10))
      .groupBy('u.id', 'r.name')
      .first();

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------------------
// Feature Routers
// ----------------------------------------------------------------
app.use('/api/projects', projectsRouter);
app.use('/api/users',    usersRouter);
app.use('/api/admin',    adminRouter);

// ----------------------------------------------------------------
// Start
// ----------------------------------------------------------------
import { fileURLToPath } from 'url';

const startServer = async () => {
  try {
    await initializeDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`🔐 OIDC: http://localhost:${PORT}/api/auth/.well-known/openid-configuration`);
      console.log(`🔑 JWKS: http://localhost:${PORT}/api/auth/jwks.json`);
      console.log(`🌐 Google OAuth: http://localhost:${PORT}/api/auth/google`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  startServer();
}

export default app;
