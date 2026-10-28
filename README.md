# FogOS — Personal Workspace (v1.0.0)

FogOS è una dashboard web installabile, pensata per desktop e telefono. Mantiene un'interfaccia scura con accenti lime, pannelli compatti, widget e layout responsive.

## Funzioni incluse

- Dashboard con orologio, panoramica, accesso rapido e Focus timer.
- Gestione attività con priorità, stato, scadenza e filtri.
- Note personali con ricerca, modifica ed eliminazione.
- Launcher per FogSignal, SKYTRACE, Fogpacks e altri progetti; i link si impostano nelle proprietà di ogni app.
- Raccolta di collegamenti web.
- Ricerca, backup JSON e ripristino dei dati.
- Dati memorizzati localmente nel browser; nessun account o backend obbligatorio.
- PWA installabile e cache offline per gli asset principali.

## Pubblicare su GitHub Pages

1. Carica il contenuto completo del repository (incluse `.github` e `site`) sul ramo `main`.
2. Nel repository vai in **Settings → Pages** e imposta **GitHub Actions** come sorgente.
3. Il workflow `.github/workflows/deploy.yml` pubblica automaticamente il contenuto di `site` a ogni push su `main`.

## Pubblicare su Cloudflare Pages

Collega il repository a Cloudflare Pages e imposta:

- **Production branch:** `main`
- **Build command:** `exit 0`
- **Build output directory:** `site`
- **Root directory:** vuoto

Non serve una build Node o installare dipendenze.

## Provarlo in locale

Apri un server HTTP dalla cartella `site` (per esempio `python -m http.server 10000`) e visita `http://localhost:10000`. Per testare l'installazione PWA in un browser, usa localhost o HTTPS; aprire `index.html` direttamente come file non attiva service worker e installazione.

## Dati e limiti

Le attività, le note, i collegamenti e i link personalizzati sono salvati nel `localStorage` del browser corrente. Non vengono sincronizzati automaticamente tra telefono e PC: usa **Impostazioni → Esporta dati** e importa il file sull'altro dispositivo. Le sei app iniziali sono segnaposto di accesso rapido: aggiungi il loro vero URL dalla voce di modifica, non viene inventato alcun URL di deploy.

Il sito non include un servizio meteo, account, database cloud o sincronizzazione multi-dispositivo. Le parti disponibili offline sono quelle statiche già memorizzate; i link esterni richiedono connessione.

## Licenza

MIT. Vedi `LICENSE`.

## Controlli tecnici

Per eseguire il controllo statico dei riferimenti, degli asset, del manifest PWA e delle risposte HTTP:

```bash
python tests/static-smoke.py
```
