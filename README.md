# FogOS — Personal Workspace (v1.1.0)

FogOS è una PWA responsive per PC e telefono. La nuova finitura è **metallo satinato opaco**, con una texture regolabile (Soft / Media / Intensa), superfici grigio acciaio e l'accento lime originale.

## Funzioni

- Dashboard responsive, orologio, statistiche e timer Focus.
- Gestione attività con priorità, completamento e scadenza.
- Note con ricerca, modifica ed eliminazione.
- Launcher personalizzabile per le app, raccolta link e ricerca globale.
- Tema metallico regolabile, accento personalizzabile, PWA installabile e shell offline.
- Backup JSON esportabile/importabile, compreso il backup locale conservato quando si accede a un account con dati cloud già presenti.
- **Registrazione e login reali**, sessione in cookie `HttpOnly`/`Secure`, logout, autenticazione server-side e sincronizzazione del workspace tramite Cloudflare Pages Functions + D1.
- Le risposte `/api/*` sono escluse dalla cache PWA per evitare che informazioni personali o stato di login vengano memorizzati dalla service worker.

## Pubblicazione consigliata: Cloudflare Pages con account funzionanti

La registrazione e il login **non funzionano su un hosting puramente statico**: GitHub Pages non esegue il backend. Per avere account e sincronizzazione, usa Cloudflare Pages come indirizzo principale dell'app. Il repository contiene una cartella `functions/` che Cloudflare riconosce come Pages Functions.

### 1. Carica il repository

Carica tutto il contenuto di questa cartella sul ramo `main`, comprese `functions/`, `migrations/`, `site/` e `package.json`.

### 2. Crea il database D1

Nel dashboard Cloudflare apri **Storage & databases → D1 SQL Database** e crea un database, ad esempio `fogos-db`. Apri la console SQL del database e incolla il contenuto di `migrations/0001_init.sql`, poi eseguilo. Lo script crea le tabelle per utenti, sessioni, workspace e rate limit.

### 3. Collega D1 a Pages

Apri il progetto Pages → **Settings → Bindings → Add → D1 database bindings**:

- **Variable name / Binding:** `DB`
- **D1 database:** seleziona `fogos-db`

Salva e fai un nuovo deploy. La funzione API controlla questo binding: se manca, l'interfaccia resta in modalità locale e segnala che il servizio account non è configurato.

### 4. Configurazione build Cloudflare

- Production branch: `main`
- Build command: `exit 0`
- Build output directory: `site`
- Root directory: vuoto

Non è richiesta una build npm. Cloudflare deve poter vedere `functions/` nella radice del repository e `site/` come cartella pubblicata.

### 5. Prova registrazione e sincronizzazione

Apri l'URL HTTPS Cloudflare, premi l'avatar in alto e scegli **Crea account**. Dopo la registrazione i dati locali iniziali vengono salvati nell'account. Accedi da un altro browser o telefono per verificare la sincronizzazione; le modifiche vengono inviate al cloud dopo una breve pausa.

## GitHub Pages

Il workflow `.github/workflows/deploy.yml` pubblica la parte statica di `site/`. Su un indirizzo GitHub Pages senza API, FogOS rimane utilizzabile in modalità locale: attività, note e link sono salvati nel browser, ma non c'è registrazione cloud perché GitHub Pages non esegue `functions/`.

È possibile configurare `site/config.js` con l'URL API Cloudflare e `ALLOWED_ORIGINS` per consentire richieste cross-origin, ma i cookie di sessione di terze parti possono essere bloccati da alcuni browser. Per un login affidabile, pubblica FogOS e la sua API sullo stesso host Cloudflare Pages.

## Dati e sicurezza

- Le password non sono salvate in chiaro: il backend usa PBKDF2-HMAC-SHA-256 con sale casuale e 30.000 iterazioni, scelto per contenere il costo CPU sul piano Cloudflare gratuito. Usa una password lunga e unica (almeno 12 caratteri); questo compromesso è adatto a un workspace personale non critico, non a dati ad alta sensibilità.
- Il database conserva l'hash del token di sessione; il token originale è in un cookie `HttpOnly`, `Secure`, `SameSite` con scadenza di 14 giorni.
- Login e registrazione hanno rate limit per identificatore IP hashato; gli indirizzi IP grezzi non vengono memorizzati nel rate-limit.
- La registrazione non invia ancora email di verifica. Non è incluso un flusso di recupero password via email: per quello serve configurare un provider di posta e il relativo invio.
- Il workspace cloud ha un limite di circa 700 KB per account.
- Se l'account ha già dati cloud, prima di sostituire la vista locale FogOS conserva un backup locale esportabile da **Impostazioni → Account Cloud**.
- Modalità ospite: dati nel browser corrente. Account attivo: dati locali più sincronizzazione cloud. Usa comunque **Esporta dati** per mantenere un backup indipendente.

## Test locali

Da una cartella con Python 3.10+ e Node.js 18+ installati, esegui:

```bash
python tests/static-smoke.py
node tests/cloud-api-smoke.mjs
```

Il test API usa un database D1 simulato in memoria per controllare registrazione, cookie di sessione, accesso autenticato ai dati, password errata e logout. Per provare il vero account cloud è necessario collegare il database D1 sul progetto Cloudflare.

## Licenza

MIT. Vedi `LICENSE`.
