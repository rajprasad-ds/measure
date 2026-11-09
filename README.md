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

Cloudflare Pages Git integration provides the deployment loop:

- Every push to `main` builds and publishes the production site.
- Pull requests receive preview deployments, so changes can be tested before
  merging.
- GitHub Actions runs the same type-check and production build on pushes and
  pull requests.

To set it up once, connect the private GitHub repository to a Cloudflare Pages
project and configure:

- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: `24` (set `NODE_VERSION=24` if Cloudflare does not detect
  `.nvmrc`)
- Production and Preview environment variables: `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`

In the GitHub repository's **Settings → Branches**, add a branch protection
rule for `main` and require the **Type check and production build** status check.
Then changes go through a pull request: CI validates them, Cloudflare publishes
a preview for review, and merging to `main` triggers the production deployment.

After the first deployment, add the HTTPS production URL to Supabase's
Authentication URL Configuration as the site URL and as an allowed redirect
URL. Add Cloudflare preview URLs to Supabase's redirect allow list only if you
intend to test authentication on previews.
