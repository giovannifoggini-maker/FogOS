# FogOS — Personal Workspace (v1.0.0)

FogOS is an installable web dashboard designed for desktop and mobile. It uses a dark interface with lime accents, compact panels, widgets, and a responsive layout.

## Features

- Dashboard with live clock, overview, quick launch, and focus timer.
- Tasks with priority, status, due labels, and filters.
- Personal notes with search, edit, and delete.
- App launcher for FogSignal, SKYTRACE, Fogpacks, and other projects. Set each actual URL in the app's edit dialog.
- Personal link library.
- Global search, JSON export, and backup restore.
- Browser-local storage; no account or backend required.
- Installable PWA with an offline cache for core static assets.

## GitHub Pages

1. Push the complete repository (including `.github` and `site`) to the `main` branch.
2. Open **Settings → Pages** and select **GitHub Actions** as the publishing source.
3. The workflow at `.github/workflows/deploy.yml` publishes `site` on every push to `main`.

## Cloudflare Pages

Connect this repository and use:

- **Production branch:** `main`
- **Build command:** `exit 0`
- **Build output directory:** `site`
- **Root directory:** leave empty

No Node build or dependencies are required.

## Local preview

Serve the `site` directory over HTTP (for example, run `python -m http.server 10000` from inside `site`) and open `http://localhost:10000`. PWA install and service workers require localhost or HTTPS; opening `index.html` as a file will not enable them.

## Data and limitations

Tasks, notes, app links, and saved links use the current browser's `localStorage`. They do not sync automatically between phone and PC. Export a JSON backup under **Settings → Export data** and import it on another device. The six initial app cards are quick-link placeholders: add the real deployed URL in each card's edit dialog. No deployment URLs are fabricated.

No weather service, user account, cloud database, or automatic cross-device sync is included. Core static assets can work offline after caching; external links need an internet connection.

## License

MIT. See `LICENSE`.

## Technical checks

Run the static asset, HTML/JavaScript reference, PWA manifest, and local HTTP smoke checks with:

```bash
python tests/static-smoke.py
```
