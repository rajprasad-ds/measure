# JEE Practice

An offline-ready, installable PWA for timed JEE practice sessions.

## Run locally

Create `.env.local` in the project root with the Supabase project URL and
publishable key:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

Never put a Supabase secret/service-role key in this frontend app. `.env.local`
is ignored by Git.

```sh
npm install
npm run dev
```

## Supabase setup

1. In the Supabase Dashboard, open **SQL Editor** and run
   `supabase/migrations/20261109230000_initial_schema.sql`.
   If you already ran the original migration before the session-sync function
   fix, also run `supabase/migrations/20261109232000_fix_upsert_session_function.sql`.
2. In **Authentication → URL Configuration**, add the local redirect URL
   `http://localhost:5173/**` (and `http://127.0.0.1:5173/**` if using that
   address) to the redirect allow list.
3. Keep email/password authentication enabled. With email confirmation
   enabled, new users must confirm the email before signing in.
4. Start the app locally, create an account, and test a session. Existing
   device-only sessions are not uploaded automatically; while signed in, use
   **Import local sessions to this account** to opt into uploading them.

The migration creates `sessions` and `session_weak_topics`, enables Row Level
Security, and adds a transaction-safe RPC for saving a session with its weak
topics. Each account can only access its own session data. The syllabus catalog
remains in `syllabus.json`; session records store stable IDs and display names.
Individual question numbers and attempts are not stored.

## Data and offline behavior

Completed sessions are written to IndexedDB first. While signed in, pending
records sync when online; failed or offline uploads remain local and can be
retried with **Sync now**. Synced cloud history is retained remotely, while the
device caches the latest 50 synced sessions per account. Unsynced records are
never removed by cache cleanup. Signed-out sessions remain local until the user
chooses to import them into an account.

The average time per question is active time divided by the number of timed
questions; skipped questions are not included. Session summaries also store
outcome counts and weak-topic counts aggregated per session. Lifetime weak-topic
totals can be derived by summing those session records.

An unfinished session is currently held in memory and will be lost if the page
is reloaded or closed before feedback is saved.

## Validate and build

```sh
npm run build
npm run preview
```

## Hosting

The repository is connected to Cloudflare Workers Builds. `wrangler.jsonc`
configures the built `dist` directory as static assets with SPA fallback, and
the checked-in Wrangler CLI makes Git deployments reproducible.

Configure the Cloudflare build settings:

- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`
- Build variable `VITE_SUPABASE_URL`: the Supabase project URL
- Build variable `VITE_SUPABASE_ANON_KEY`: the Supabase publishable key (never a
  secret/service-role key)
- Node.js version: `24` (set `NODE_VERSION=24` if Cloudflare does not detect
  `.nvmrc`)

Git deployments publish `main` to production and create branch/PR preview
deployments when enabled for the Worker. GitHub Actions independently runs the
type-check and production build on pushes and pull requests. In the GitHub
repository's **Settings → Branches**, protect `main` and require the **Type
check and production build** status check before merging.

After the first successful deployment, add the HTTPS production hostname to
Supabase **Authentication → URL Configuration** as the site URL and an allowed
redirect URL. Add a preview hostname to the allow list only if you intend to
test email confirmation from that preview.
