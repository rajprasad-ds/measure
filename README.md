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

Keep the development server running while editing. Vite applies React changes
through hot reload in the open browser; ordinary edits do not need a production
build. Use `npm run build` to verify the app before deployment.

## Supabase setup

1. In the Supabase Dashboard, open **SQL Editor** and run
   `supabase/migrations/20261109230000_initial_schema.sql`.
   If you already ran the original migration before the session-sync function
   fix, also run `supabase/migrations/20261109232000_fix_upsert_session_function.sql`.
2. Run `supabase/migrations/20261110194500_attempts.sql` to add per-question
   attempts and the transaction-safe session-and-attempt sync RPC.
3. Run `supabase/migrations/20261110201500_cards.sql` to add question cards,
   fact cards, card links, review history, and card-level RLS policies.
4. Run `supabase/migrations/20261110213000_practice_image_cards.sql` to allow
   image-only question prompts and optional question solutions.
5. Run `supabase/migrations/20261110220000_image_required_cards.sql` to require
   a photo on every question prompt and on both sides of every fact card.
5. In **Authentication → URL Configuration**, add the local redirect URL
   `http://localhost:5173/**` (and `http://127.0.0.1:5173/**` if using that
   address) to the redirect allow list.
6. Keep email/password authentication enabled. With email confirmation
   enabled, new users must confirm the email before signing in.
7. Start the app locally, create an account, and test a session. Existing
   device-only sessions are not uploaded automatically; while signed in, use
   **Import local data to this account** to opt into uploading it.

The migrations create `sessions`, `session_weak_topics`, `attempts`, `questions`,
`fact_cards`, `question_fact_links`, and `fact_reviews`, enable Row Level
Security, and add transaction-safe RPCs for syncing sessions and attempts.
Each account can only access its own data. The syllabus catalog remains in
`syllabus.json`; session records store stable IDs and display names. Attempts
do not store live question numbers. Existing saved sessions remain unchanged
and do not receive fabricated attempt records.

## Data and offline behavior

Completed sessions are written to IndexedDB first. While signed in, pending
records sync when online; failed or offline uploads remain local and can be
retried with **Sync now**. Synced cloud history is retained remotely, while the
device caches the latest 50 synced sessions per account. Unsynced records are
never removed by cache cleanup. Signed-out sessions remain local until the user
chooses to import them into an account.

The average time per question is active time divided by the number of timed
questions; skipped questions are not included. Session summaries also store
outcome counts and weak-topic counts aggregated per session. Each timed
question's result, cause, optional slip subtype, topics, and time is also saved
as an attempt on this device and synced when online. Lifetime weak-topic totals
can be derived by summing those session records.

Question and fact cards are stored locally first and sync in dependency order.
Cards and links use soft deletion so deletions can sync to other devices.
Question source metadata is intentionally not collected. A question card needs
an image of the question. A fact card needs images for both prompt and answer.
Optional text helps search and recall. Photos are compressed and kept offline
on the device.
Cloud metadata can sync their IDs, but photo backup/download is not enabled yet;
Google Drive upload is still planned.

The current in-progress session and feedback are saved locally in IndexedDB.
After a reload or reopen, the app offers **Resume session** or **Discard
session**. Timers resume from timestamps; if the planned end has passed, the
session resumes at feedback and a running question is closed at the planned end.

If a question stopwatch reaches eight minutes, it pauses and asks whether you
are still solving. Confirm within one minute to keep the session open; the
stopwatch stays paused until you press Start. When the stopwatch is stopped,
ten minutes without interaction triggers a one-minute confirmation before the
app moves the session to feedback. Only question stopwatch durations count as
active time.

## Validate and build

```sh
npm test
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
unit tests, type-check, and production build on pushes and pull requests. In
the GitHub repository's **Settings → Branches**, protect `main` and require the
**Type check and production build** status check before merging.

After the first successful deployment, add the HTTPS production hostname to
Supabase **Authentication → URL Configuration** as the site URL and an allowed
redirect URL. Add a preview hostname to the allow list only if you intend to
test email confirmation from that preview.
