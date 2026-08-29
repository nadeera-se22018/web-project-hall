import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const SENSITIVE_KEYS = [
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'authorization',
  'secret',
  'session_secret',
  'jwt_secret',
  'cookie',
  'code',
];

const maskSensitiveData = winston.format((info) => {
  const maskObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(maskObject);

    const copy = { ...obj };
    for (const key of Object.keys(copy)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive))) {
        copy[key] = '[REDACTED]';
      } else if (typeof copy[key] === 'object' && copy[key] !== null) {
        copy[key] = maskObject(copy[key]);
      }
    }
    return copy;
  };

  const masked = maskObject(info);
  return masked;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    maskSensitiveData(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'project-hall-backend' },
  transports: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `[${timestamp}] [${level}]: ${message}${metaString}`;
        })
      ),
    }),
  ],
});

export const morganStream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

export default logger;
