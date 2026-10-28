# Changelog

## v1.1.0 — 2026-10-28

- Added a matte satin-metal background with Soft / Medium / Strong texture control.
- Added account UI for registration, login, logout and cloud-sync status.
- Added Cloudflare Pages API routes for registration, password verification, session handling and cloud workspace storage.
- Added D1 migration for users, hashed sessions, workspace data and rate-limit buckets.
- Passwords use salted PBKDF2-HMAC-SHA-256 with a per-user stored work factor tailored to the Cloudflare free CPU budget; session identifiers are stored as hashes in D1 and sent in Secure, HttpOnly cookies.
- Added API-aware service-worker exclusions, cloud/local UI status, and a safety backup before loading a different cloud workspace.
- Expanded static and Cloud API smoke tests.
- Documented that Cloudflare Pages + D1 is needed for real accounts; GitHub Pages remains a local-only static publication.
