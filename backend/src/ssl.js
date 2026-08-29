import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import selfsigned from 'selfsigned';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CERTS_DIR = process.env.CERTS_DIR || path.join(__dirname, '../.certs');
const CERT_PATH = path.join(CERTS_DIR, 'cert.pem');
const KEY_PATH = path.join(CERTS_DIR, 'key.pem');

export async function getOrCreateSSLCert() {
  if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) {
    return {
      key: fs.readFileSync(KEY_PATH, 'utf8'),
      cert: fs.readFileSync(CERT_PATH, 'utf8'),
    };
  }

  if (!fs.existsSync(CERTS_DIR)) {
    fs.mkdirSync(CERTS_DIR, { recursive: true });
  }

  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const generateFn = selfsigned.generate || selfsigned.default?.generate;
  const pems = await generateFn(attrs, {
    days: 365,
    algorithm: 'sha256',
    keySize: 2048,
    extensions: [
      {
        name: 'basicConstraints',
        cA: true,
      },
      {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        keyEncipherment: true,
      },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
        ],
      },
    ],
  });

  fs.writeFileSync(KEY_PATH, pems.private, 'utf8');
  fs.writeFileSync(CERT_PATH, pems.cert, 'utf8');

  return {
    key: pems.private,
    cert: pems.cert,
  };
}

export default getOrCreateSSLCert;
