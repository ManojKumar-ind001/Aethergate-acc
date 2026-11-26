# AccountBridge

Multi-Account Identity Manager & Unified API Gateway for Google, GitHub, and AWS.

## Architecture

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons (`src/frontend/`)
- **Backend**: Node.js 22, Express, TypeScript (`server.ts`, `src/backend/`)
- **Database**: SQLite via `better-sqlite3` for local development (`.data/accountbridge.db`), with PostgreSQL migration schema in `src/backend/database/migrations/001_initial.sql`
- **Security**:
  - AccountBridge user passwords hashed with `scrypt` + per-user random salt
  - Provider OAuth tokens & AWS External IDs encrypted at rest with AES-256-GCM
  - Master API keys generated with 256-bit cryptographic entropy, stored only as SHA-256 hashes
  - OAuth 2.0 Authorization Code + PKCE (`S256`) + server-side `oauth_states` validation

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`.

## Running Tests

```bash
npm test
```

## Production Build

```bash
npm run build
NODE_ENV=production npm start
```
