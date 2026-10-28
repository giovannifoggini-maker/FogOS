# FogOS — Personal Workspace (v1.1.0)

FogOS is a responsive installable web app for desktop and mobile. Version 1.1 adds a **matte satin-metal finish** with Soft / Medium / Strong texture levels, steel-grey surfaces and the original lime accent.

## Features

- Responsive dashboard, clock, stats and Focus timer.
- Tasks with priority, completion and due-date labels.
- Searchable editable notes, custom app launcher, bookmarks and global search.
- Adjustable metallic background, accent colors, installable PWA and offline app shell.
- JSON backup import/export, including a local backup preserved when signing in to an account with existing cloud data.
- **Real registration and login**, server-side sessions, `HttpOnly`/`Secure` cookies, logout and workspace sync using Cloudflare Pages Functions + D1.
- `/api/*` responses are excluded from the PWA cache to prevent personal account/API responses from being stored by the service worker.

## Recommended deployment: Cloudflare Pages for real accounts

Registration/login need a backend and **cannot run on static-only hosting**. GitHub Pages cannot execute server functions. Use Cloudflare Pages as the primary URL for account and cross-device sync; the repository includes a `functions/` directory for Pages Functions.

### 1. Upload the repository

Upload the whole project to the `main` branch, including `functions/`, `migrations/`, `site/` and `package.json`.

### 2. Create the D1 database

In Cloudflare, open **Storage & databases → D1 SQL Database**, create a database such as `fogos-db`, then open its SQL console. Paste and run `migrations/0001_init.sql`. It creates tables for users, sessions, workspace data and rate limiting.

### 3. Bind D1 to Pages

Open the Pages project → **Settings → Bindings → Add → D1 database bindings**:

- **Variable name / binding:** `DB`
- **D1 database:** select `fogos-db`

Save and redeploy. If this binding is missing, FogOS stays in local mode and displays a setup message rather than pretending registration works.

### 4. Cloudflare build settings

- Production branch: `main`
- Build command: `exit 0`
- Build output directory: `site`
- Root directory: leave blank

No npm build is required. Cloudflare must see `functions/` at the repository root and `site/` as the published directory.

### 5. Test registration and sync

Open the deployed HTTPS Cloudflare URL, click the avatar and select **Create account**. After registration, the current local workspace is saved to the account. Sign in from another browser or phone to verify sync; edits are uploaded after a short debounce.

## GitHub Pages

The included `.github/workflows/deploy.yml` publishes the static part of `site/`. On a GitHub Pages URL without an API, FogOS remains usable locally, but cloud registration is unavailable because GitHub Pages does not execute `functions/`.

You can set `site/config.js` to point at a Cloudflare API URL and set `ALLOWED_ORIGINS` to allow cross-origin requests, but some browsers block third-party session cookies. For reliable login, serve the frontend and API from the same Cloudflare Pages host.

## Data and security notes

- Passwords are not stored in plaintext; the backend uses PBKDF2-HMAC-SHA-256 with a random salt and 30,000 iterations, a deliberate compromise for the Cloudflare free CPU budget. Use a long, unique password (at least 12 characters); this trade-off suits a personal workspace, not highly sensitive data.
- The database stores only the hash of each session token; the token is held in an `HttpOnly`, `Secure`, `SameSite` cookie that expires after 14 days.
- Login and registration are rate limited using a hashed IP identifier; raw IP addresses are not stored by the rate-limit table.
- Registration does not send verification emails yet. Email-based password recovery is not included because it requires a configured mail provider.
- Workspace payloads are limited to about 700 KB per account.
- If cloud data already exists, FogOS keeps a local backup before replacing the visible workspace; export it from **Settings → Cloud account**.
- Guest mode stores data in the current browser. Signed-in mode stores local data and syncs it to the cloud. Keep independent JSON backups too.

## Local tests

With Python 3.10+ and Node.js 18+:

```bash
python tests/static-smoke.py
node tests/cloud-api-smoke.mjs
```

The API smoke test uses an in-memory mock of D1 and exercises registration, session cookies, authenticated data access, invalid passwords and logout. Real cloud authentication requires a D1 binding on Cloudflare.

## License

MIT. See `LICENSE`.
