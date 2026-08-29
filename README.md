# Project Hall - Secure Student Project Showcase Platform

Project Hall is a secure full-stack web application designed for students and educational institutions to showcase, manage, and discover academic and capstone projects. Built with enterprise-grade security standards and OWASP Top 10 mitigations, it features seamless OIDC Identity Provider authentication (Auth0 & Google OAuth), Role-Based Access Control (RBAC), end-to-end local HTTPS encryption, input sanitization, and structured security logging.

---

## 📋 Table of Contents
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Database Setup & Schema](#database-setup--schema)
- [Running Locally Over HTTPS](#running-locally-over-https)
- [Authentication & Identity Provider (Auth0)](#authentication--identity-provider-auth0)
- [Security & OWASP Top 10 Mitigations](#security--owasp-top-10-mitigations)
- [API Endpoints Overview](#api-endpoints-overview)

---

## 🏗️ Architecture & Tech Stack

- **Frontend**: React (Vite), Tailwind CSS, Radix UI, `@auth0/auth0-react`, Axios, DOMPurify, Phosphor Icons
- **Backend**: Node.js, Express.js (HTTPS), Knex.js, `pg` driver, `express-oauth2-jwt-bearer`, `jwks-rsa`, `helmet`, `express-rate-limit`, `express-mongo-sanitize`, `xss`, `winston`, `morgan`
- **Database**: PostgreSQL (Dockerized or standalone local instance)
- **Identity Provider (IdP)**: Auth0 OpenID Connect (OIDC) & Google OAuth2

---

## ⚙️ Prerequisites

Ensure you have the following installed on your local development machine:
- **Node.js**: `v18.x` or later (Node 20 LTS recommended)
- **npm**: `v9.x` or later
- **Docker & Docker Compose** (Optional, for database deployment) or local **PostgreSQL** instance (`v14+`)
- **Git**

---

## 🔐 Environment Configuration

The application requires configuration files for the root directory, the backend server, and the frontend client. Example templates with dummy/placeholder values are provided in `.env.example`.

### 1. Root Configuration (`.env`)
Create a `.env` file in the root workspace directory by copying `.env.example`:
```bash
cp .env.example .env
```
Key variables:
```env
# Server Environment
NODE_ENV=development
PORT=5000
FRONTEND_URL=https://localhost:5173

# Database Connection (Backend / Docker)
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=project_hall
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=project_hall
HOST_PGPORT=5433

# JWT & Session
JWT_ISSUER=https://localhost:5000
JWT_AUDIENCE=https://localhost:5173
SESSION_SECRET=your_secure_random_session_secret_here

# Google OAuth2 Credentials (Optional)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_CALLBACK_URL=https://localhost:5000/api/auth/google/callback

# Logging
LOG_LEVEL=info
```

### 2. Backend Configuration (`backend/.env`)
Create a `.env` file in `backend/`:
```bash
cp backend/.env.example backend/.env
```
Populate Auth0 tenant credentials:
```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=https://localhost:5173

PGUSER=postgres
PGHOST=localhost
PGPASSWORD=postgres
PGDATABASE=project_hall
PGPORT=5432

JWT_ISSUER=https://localhost:5000
JWT_AUDIENCE=https://localhost:5173
SESSION_SECRET=your_secure_random_session_secret_here

AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your_auth0_client_id_here
AUTH0_CLIENT_SECRET=your_auth0_client_secret_here

LOG_LEVEL=info
```

### 3. Frontend Configuration (`frontend/.env`)
Create a `.env` file in `frontend/`:
```bash
cp frontend/.env.example frontend/.env
```
Configure your client credentials:
```env
VITE_API_URL=https://localhost:5000
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your_auth0_client_id_here
VITE_AUTH0_CALLBACK_URL=https://localhost:5173/callback
```

> **Note**: Sensitive `.env` files, private keys, certificates, and log directories are excluded from Git tracking via `.gitignore`.

---

## 🗄️ Database Setup & Schema

The database automatically initializes upon server startup using `backend/init.sql`.

### Option A: Using Docker Compose
Start the PostgreSQL container:
```bash
docker-compose up -d postgres
```

### Option B: Local PostgreSQL Service
Create the target database in your local PostgreSQL engine:
```sql
CREATE DATABASE project_hall;
```

### Database Schema Structure (`init.sql`)

```sql
-- Clean Slate & Drop
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS student_follows CASCADE;
DROP TABLE IF EXISTS project_likes CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS otps CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- 1. Roles
CREATE TABLE roles (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

-- 2. Permissions
CREATE TABLE permissions (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

-- 3. Role Permissions (RBAC Mapping)
CREATE TABLE role_permissions (
    role_id       INT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 4. Users Entity / Collection
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    name          VARCHAR(255)        DEFAULT NULL,
    avatar_url    VARCHAR(500)        DEFAULT NULL,
    google_id     VARCHAR(100) UNIQUE DEFAULT NULL,
    password_hash VARCHAR(255)        DEFAULT NULL,
    role_id       INT REFERENCES roles(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 5. OTPs (Passwordless Authentication)
CREATE TABLE otps (
    id         SERIAL PRIMARY KEY,
    email      VARCHAR(255) NOT NULL,
    code       VARCHAR(6)   NOT NULL,
    expires_at TIMESTAMPTZ  NOT NULL,
    used       BOOLEAN      DEFAULT FALSE,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- 6. Refresh Tokens (Token Revocation Support)
CREATE TABLE refresh_tokens (
    id         SERIAL PRIMARY KEY,
    token      VARCHAR(500) UNIQUE NOT NULL,
    user_id    INT REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Projects Entity / Submissions
CREATE TABLE projects (
    id            SERIAL PRIMARY KEY,
    title         VARCHAR(255) NOT NULL,
    description   TEXT         NOT NULL,
    thumbnail_url VARCHAR(500) DEFAULT NULL,
    visibility    VARCHAR(20)  DEFAULT 'private' CHECK (visibility IN ('public', 'private', 'removed')),
    created_by    INT REFERENCES users(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Project Likes
CREATE TABLE project_likes (
    id         SERIAL PRIMARY KEY,
    project_id INT REFERENCES projects(id) ON DELETE CASCADE,
    liked_by   INT REFERENCES users(id)    ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (project_id, liked_by)
);

-- 9. Student Follows
CREATE TABLE student_follows (
    id          SERIAL PRIMARY KEY,
    follower_id INT REFERENCES users(id) ON DELETE CASCADE,
    student_id  INT REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (follower_id, student_id)
);

-- 10. Notifications
CREATE TABLE notifications (
    id           SERIAL PRIMARY KEY,
    recipient_id INT REFERENCES users(id) ON DELETE CASCADE,
    type         VARCHAR(50) NOT NULL,
    actor_id     INT REFERENCES users(id) ON DELETE SET NULL,
    payload      JSONB        DEFAULT '{}',
    read         BOOLEAN      DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for Fast Lookups
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_project_likes_project_id ON project_likes(project_id);
CREATE INDEX idx_student_follows_student_id ON student_follows(student_id);
CREATE INDEX idx_notifications_recipient_id ON notifications(recipient_id);

-- Initial Seed Data
INSERT INTO roles (id, name) VALUES (1, 'admin'), (2, 'recruiter'), (3, 'student') ON CONFLICT DO NOTHING;
INSERT INTO permissions (id, name) VALUES 
    (1, 'projects:read'), (2, 'projects:create'), (3, 'projects:write'),
    (4, 'projects:like'), (5, 'users:follow'), (6, 'users:manage'), (7, 'projects:manage')
ON CONFLICT DO NOTHING;

-- Map Default Permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES 
    (1,1),(1,2),(1,3),(1,4),(1,5),(1,6),(1,7),
    (2,1),(2,4),(2,5),
    (3,1),(3,2),(3,3),(3,4)
ON CONFLICT DO NOTHING;
```

---

## 🚀 Running Locally Over HTTPS

Both the frontend and backend are configured to serve traffic securely over local HTTPS using SSL/TLS certificates.

### Step 1: Install Dependencies
Open two terminal windows:

**Terminal 1 (Backend):**
```bash
cd backend
npm install
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm install
```

### Step 2: Start the Backend Server (HTTPS)
```bash
cd backend
npm run dev
```
- The backend initializes the PostgreSQL schema.
- Generates or loads self-signed SSL certificates in memory via `selfsigned`.
- Starts the secure Express HTTPS server on **`https://localhost:5000`**.

### Step 3: Start the Frontend Client (HTTPS)
```bash
cd frontend
npm run dev
```
- Starts the Vite development server with `@vitejs/plugin-basic-ssl`.
- The application will be accessible at **`https://localhost:5173`**.

> **Note on Browser SSL Warnings**: Because local development uses self-signed certificates, your browser may prompt a security warning on first visit. Accept the certificate / proceed to `localhost` to continue.

---

## 🔑 Authentication & Identity Provider (Auth0)

1. **OIDC Integration**:
   - The frontend integrates `@auth0/auth0-react` wrapped in `main.jsx`.
   - The redirect callback route is handled at `https://localhost:5173/callback`.
2. **Access Token Verification**:
   - The frontend retrieves the access token silently (`getAccessTokenSilently`) and sends it in the `Authorization: Bearer <token>` header.
   - The backend validates the token using Auth0's JSON Web Key Set (JWKS) via `jwks-rsa` at `https://<AUTH0_DOMAIN>/.well-known/jwks.json`.
3. **User Profile Section**:
   - The Profile section renders authenticated profile details: **Username**, **Name**, **Email Address**, **Contact Number**, and **Organization/Business Name**.

---

## 🛡️ Security & OWASP Top 10 Mitigations

| Vulnerability Category | Mitigation Strategy | Implementation |
|---|---|---|
| **A01: Broken Access Control** | Token verification & resource ownership checks | `requireProjectOwnership` middleware strictly matches project `created_by` with token `sub`/user ID |
| **A02: Cryptographic Failures** | End-to-end TLS/HTTPS encryption & masked logs | HTTPS on all endpoints; sensitive keys automatically redacted in Winston logger |
| **A03: Injection (NoSQL / SQL / XSS)** | Parameterized queries, payload sanitizers & DOMPurify | `express-mongo-sanitize`, `xss` backend middleware, Knex query bindings, and `dompurify` in React |
| **A05: Security Misconfiguration** | HTTP security headers & strict CORS | `helmet` configured with CSP & `X-Frame-Options: DENY`; CORS whitelist restricted to trusted frontend |
| **A07: Identification & Auth Failures** | Rate limiting, brute-force protection & CSRF tokens | `express-rate-limit` on `/api/auth/*` and `csrfProtection` double-submit cookie validation |
| **A09: Security Logging Failures** | Centralized logging & audit trails | `winston` structured file logging (`error.log`, `combined.log`) & `morgan` HTTP traffic stream |

---

## 📡 API Endpoints Overview

### Public & Authentication Endpoints
- `GET /api/auth/.well-known/openid-configuration` - OIDC Discovery document
- `GET /api/auth/jwks.json` - JSON Web Key Set
- `GET /api/auth/csrf-token` - Issue CSRF protection token
- `POST /api/auth/login` - Local password authentication
- `POST /api/auth/signup` - Local account registration
- `POST /api/auth/otp/send` - Send passwordless magic link
- `POST /api/auth/otp/verify` - Verify passwordless code
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/revoke` - Revoke tokens and clear cookies

### Protected Application Endpoints
- `GET /api/auth/me` - Retrieve current authenticated user profile and permissions
- `GET /api/projects` - Browse public project feed
- `GET /api/projects/:id` - Fetch single project details
- `POST /api/projects` - Create new project submission
- `PUT /api/projects/:id` - Update existing project (owner only)
- `DELETE /api/projects/:id` - Delete project (owner only)
- `POST /api/projects/:id/thumbnail` - Upload project image thumbnail
- `POST /api/projects/:id/like` - Toggle project like
- `GET /api/users/:id/profile` - Fetch student profile and public showcase
- `POST /api/users/:id/follow` - Toggle follow student
- `GET /api/users/notifications` - Fetch user notification feed
- `GET /api/admin/stats` - Admin metrics & system health (admin role only)
- `GET /api/admin/users` - Admin user directory (admin role only)
- `PUT /api/admin/users/:id/role` - Update user RBAC role (admin role only)

---

## 📄 License
This project is licensed under the MIT License.
