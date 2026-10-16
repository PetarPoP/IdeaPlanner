# Setting up Idea Planner

Everything works locally with no accounts or keys: boards save on the device,
sign-in codes are printed in the server log instead of emailed, and the AI
features say they are off. Each step below switches one real service on. Do
them in this order; every step after the first is optional.

All server settings are environment variables (see `.env.example`). Put them
wherever the server runs (a `.env` loaded by your host, Fly/Render/Railway
secrets, a systemd unit…).

## 1. Database and address (needed for sharing, accounts, live editing)

1. Create a free Postgres database on [neon.tech](https://neon.tech)
   (New project → copy the connection string, the one ending in
   `?sslmode=require`).
2. Set on the server:
   ```
   DATABASE_URL=postgres://…?sslmode=require
   PUBLIC_URL=https://plan.example.com     # where people open the app, no trailing slash
   ```
3. Deploy (see README "Deploy the web app"). Migrations run on start.
4. Serve it over **HTTPS**. Install-as-app, offline mode, notifications and
   the clipboard all need HTTPS. Most hosts give you this for free; behind
   your own proxy (Caddy, nginx) make sure WebSocket upgrades on
   `/api/boards/*/live` are passed through (Caddy does this by default; nginx
   needs `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).

Check: `https://plan.example.com/api/health` returns `"ok":true`, and the server log no longer warns "DATABASE_URL is not set".

## 2. Sign-in emails (Resend)

Sign-in is by email link or 6-digit code, and invites and the daily reminder
digest go out by email.

1. Make an account on [resend.com](https://resend.com).
2. Domains → Add domain → add the DNS records it shows at your DNS provider →
   wait for "Verified". (Without a domain you can only send to your own
   address from `onboarding@resend.dev`, fine for testing.)
3. API Keys → Create (permission "Sending access").
4. Set:
   ```
   RESEND_API_KEY=re_…
   MAIL_FROM=Idea Planner <plans@example.com>     # an address on the verified domain
   DIGEST_HOUR_UTC=7                              # optional: hour of the daily reminder email
   ```

Without `RESEND_API_KEY` the server prints each email (with the code) to its
log instead.

## 3. Sign in with Google (optional)

1. [console.cloud.google.com](https://console.cloud.google.com) → create or
   pick a project.
2. APIs & Services → OAuth consent screen → External, fill in the app name
   and your email, add scopes `openid`, `email`, `profile`, publish it.
3. APIs & Services → Credentials → Create credentials → OAuth client ID →
   **Web application**.
   - Authorised JavaScript origins: `https://plan.example.com`
   - Authorised redirect URIs: `https://plan.example.com/api/auth/google/callback`
4. Set:
   ```
   GOOGLE_CLIENT_ID=….apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-…
   ```

The "Continue with Google" button appears once both are set. The desktop and
mobile apps sign in with the emailed code (Google sign-in is web only).

## 4. Receipt scanning and booking emails (Anthropic API)

Photographing a receipt (Budget → Scan receipt) and turning a forwarded
booking email into a Booking card use Claude.

1. [console.anthropic.com](https://console.anthropic.com) → API Keys → Create
   key. Add a payment method under Billing.
2. Set:
   ```
   ANTHROPIC_API_KEY=sk-ant-…
   ANTHROPIC_MODEL=claude-sonnet-5-5     # optional
   ```

Only signed-in people can use these, so the key cannot be used by anyone who
just has a link. Without a key, bookings are still guessed from the email text
(dates, confirmation codes) with no AI.

## 5. Email into a board (optional)

Each board can receive mail at `board-<id>@<INBOX_DOMAIN>`.

1. Pick a domain or subdomain for it, e.g. `in.example.com`.
2. With Cloudflare (free): add the domain to Cloudflare → Email → Email
   Routing → enable it (adds MX records) → Routing rules → Catch-all →
   "Send to a Worker" → create a Worker with:
   ```js
   export default {
     async email(message, env) {
       const raw = await new Response(message.raw).arrayBuffer()
       await fetch('https://plan.example.com/api/inbox', {
         method: 'POST',
         headers: { authorization: `Bearer ${env.INBOX_TOKEN}`, 'content-type': 'message/rfc822' },
         body: raw,
       })
     },
   }
   ```
   and add `INBOX_TOKEN` as a secret on the Worker (Settings → Variables).
3. Set the same token on the server:
   ```
   INBOX_TOKEN=<a long random string, e.g. openssl rand -hex 32>
   INBOX_DOMAIN=in.example.com
   ```

Mailgun routes or Postmark inbound work too: forward the raw message to the
same URL with the same header.

## 6. Desktop and mobile apps

They talk to the same server. Build them with:

```
VITE_API_URL=https://plan.example.com
VITE_PUBLIC_URL=https://plan.example.com
```

and allow their origins on the server (already the default):

```
CORS_ORIGINS=tauri://localhost,http://tauri.localhost
```

Android and iOS need their SDKs on the machine that builds them:

- Android: install Android Studio, the NDK and a JDK, set `ANDROID_HOME` and
  `NDK_HOME`, then `npx tauri android init` once and `npm run android`.
- iOS (macOS only): install Xcode, then `npx tauri ios init` once and
  `npm run ios`. Set your Apple team in `src-tauri/tauri.conf.json`
  (`bundle.iOS.developmentTeam`) to run on a phone.

## Nothing to set up

- Weather (Open-Meteo), travel times between stops (OpenStreetMap +
  OSRM) and currency conversion (open.er-api.com) use free public APIs with
  no keys.
- Reminders in the browser use the system notification permission, asked the
  first time someone presses "Remind me a day before" in the reminders bell.

## Running it all locally

```sh
cargo build -p ideaplanner-server
PORT=3001 PUBLIC_URL=http://localhost:3000 ./target/debug/ideaplanner-server   # codes print here
VITE_DEV_API=1 npm run dev                                                     # http://localhost:3000, /api proxied to :3001
```

Open two browsers on the same board to see live editing and cursors.
