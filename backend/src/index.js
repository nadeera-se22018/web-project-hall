import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import https from 'https';
import http from 'http';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { fileURLToPath } from 'url';

import logger, { morganStream } from './logger.js';
import { initializeDatabase, db } from './db.js';
import keys from './keys.js';
import { getOrCreateSSLCert } from './ssl.js';
import {
  sendOTP,
  verifyOTP,
  signupWithPassword,
  loginWithPassword,
  refreshTokens,
  revokeToken,
  generateTokenSet,
} from './auth.js';
import { authenticateToken, sanitizeXSS, csrfProtection } from './middleware.js';

import projectsRouter from './routes/projects.js';
import usersRouter    from './routes/users.js';
import adminRouter    from './routes/admin.js';

const app          = express();
const PORT         = process.env.PORT || 5000;
const JWT_ISSUER   = process.env.JWT_ISSUER   || 'https://localhost:5000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://localhost:5173';

const UPLOADS_DIR = process.env.UPLOADS_DIR || 
  (fs.existsSync('/app/uploads') ? '/app/uploads' : path.join(process.cwd(), 'uploads'));

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", FRONTEND_URL, "https://localhost:5173", "https://127.0.0.1:5173", "https://*.auth0.com", "https://accounts.google.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  xFrameOptions: { action: 'deny' },
}));

const allowedOrigins = [
  FRONTEND_URL,
  'https://localhost:5173',
  'https://127.0.0.1:5173',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('Blocked by CORS policy', { origin });
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-XSRF-Token', 'X-Requested-With'],
  exposedHeaders: ['X-CSRF-Token', 'X-XSRF-Token'],
  maxAge: 86400,
}));

app.use(morgan(':method :url :status :res[content-length] - :response-time ms', { stream: morganStream }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

const submissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submission requests, please try again later.' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/otp', authLimiter);
app.use('/api/projects', submissionLimiter);

app.use(express.json());
app.use(cookieParser());
app.use(mongoSanitize({
  replaceWith: '_',
}));
app.use(sanitizeXSS);
app.use(csrfProtection);

const setAuthCookies = (res, tokenSet) => {
  res.cookie('access_token', tokenSet.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 15 * 60 * 1000,
  });

  res.cookie('refresh_token', tokenSet.refresh_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

app.use('/uploads', express.static(UPLOADS_DIR));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: 'none',
    httpOnly: true,
    maxAge: 5 * 60 * 1000,
  },
}));

app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID || 'mock-client-id',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'mock-client-secret',
    callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'https://localhost:5000/api/auth/google/callback',
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
      
      logger.info('Google OAuth login success', { email: user.email, userId: user.id });
      return done(null, user);
    } catch (err) {
      logger.error('Google OAuth error', { error: err.message });
      return done(err);
    }
  }
));

app.get('/api/auth/csrf-token', (req, res) => {
  let token = req.cookies?.['XSRF-TOKEN'] || crypto.randomBytes(32).toString('hex');
  res.cookie('XSRF-TOKEN', token, {
    secure: true,
    sameSite: 'none',
    httpOnly: false,
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ csrfToken: token });
});

app.post('/api/auth/otp/send', async (req, res) => {
  try {
    const result = await sendOTP(req.body.email);
    logger.info('OTP requested', { email: req.body.email });
    res.json(result);
  } catch (e) {
    logger.warn('OTP request failed', { email: req.body.email, error: e.message });
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/auth/otp/verify', async (req, res) => {
  try {
    const tokens = await verifyOTP(req.body.email, req.body.code);
    setAuthCookies(res, tokens);
    logger.info('OTP verification succeeded', { email: req.body.email });
    res.json({ message: 'OTP verification successful' });
  } catch (e) {
    logger.warn('OTP verification failed', { email: req.body.email, error: e.message });
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const tokens = await signupWithPassword(req.body.email, req.body.password, req.body.role_id || 3);
    setAuthCookies(res, tokens);
    logger.info('User signup successful', { email: req.body.email });
    res.status(201).json({ message: 'Signup successful' });
  } catch (e) {
    logger.warn('User signup failed', { email: req.body.email, error: e.message });
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const tokens = await loginWithPassword(req.body.email, req.body.password);
    setAuthCookies(res, tokens);
    logger.info('User login successful', { email: req.body.email });
    res.json({ message: 'Login successful' });
  } catch (e) {
    logger.warn('User login failed', { email: req.body.email, error: e.message });
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
    logger.warn('Token refresh failed', { error: e.message });
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
    logger.info('Token revocation requested');
    res.json({ message: 'Token successfully revoked' });
  } catch (e) {
    logger.error('Token revocation failed', { error: e.message });
    res.status(400).json({ error: e.message });
  }
});

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
      logger.error('Google callback error', { error: err.message });
      res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    }
  }
);

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

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.dbId || parseInt(req.user.sub, 10);
    const user = await db('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .leftJoin('role_permissions as rp', 'r.id', 'rp.role_id')
      .leftJoin('permissions as p', 'rp.permission_id', 'p.id')
      .select('u.id', 'u.email', 'u.name', 'u.avatar_url', 'r.name as role')
      .select(db.raw(`COALESCE(ARRAY_AGG(p.name) FILTER (WHERE p.name IS NOT NULL), '{}') as permissions`))
      .where('u.id', userId)
      .groupBy('u.id', 'r.name')
      .first();

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    logger.error('Error fetching /api/auth/me', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use('/api/projects', projectsRouter);
app.use('/api/users',    usersRouter);
app.use('/api/admin',    adminRouter);

app.use((err, req, res, _next) => {
  logger.error('Unhandled server error', {
    error: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

const startServer = async () => {
  try {
    await initializeDatabase();
    const ssl = await getOrCreateSSLCert();
    const server = https.createServer(ssl, app);
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running securely at https://localhost:${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
};

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  startServer();
}

export default app;
