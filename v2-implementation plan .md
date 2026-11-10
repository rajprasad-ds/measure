# JEE Practice v2: Implementation Plan

**Audience:** the coding agent that built the current app (React + Vite + TypeScript, Dexie, Supabase, PWA, Cloudflare Workers Builds).
**Owner:** Raj (single user, two devices: phone for sessions, laptop for analysis).
**How to use this document:** work phase by phase. Each phase is one branch and one pull request. Do not start a phase before the previous one is merged and the owner has tested it on his phone. Ask the owner before changing anything listed under "Decisions already made".

---

## 0. Product goal in one paragraph

The app must turn every mistake into something he can fix. A wrong question becomes (a) a **question card** (the question and its solution or approach), (b) zero or more **fact cards** (a fact, formula, reaction, exception or misconception that the question exposed), and (c) a **link** between them. Facts are revised on a schedule (fact revision). Stored questions are replayed in a practice-style session (question revision). A "Today" screen proposes what to do so he never has to decide where to start. Failure in one place feeds the other: a forgotten fact raises the priority of its linked questions, and a missed linked question raises the priority of the fact behind it.

## 1. Current state (verified by reading the repo)

- `src/App.tsx` (about 1,200 lines) holds almost all UI and state. Phases: `active`, `feedback`, `summary`.
- `src/database.ts`: Dexie database `jee-practice`, version 3, one store `sessions`.
- `src/cloudSync.ts`: pushes pending sessions to Supabase via the RPC `upsert_session_with_topics`; pulls the latest 50.
- Supabase tables: `sessions`, `session_weak_topics` (RLS on, per-user policies).
- `syllabus.json` at repo root provides `exam`, `subjects[].chapters[].topics[]` with stable string ids (`maths-u11-t03`). `src/syllabus.ts` wraps it.
- Per-question data (number, time, result, topics) exists only in memory during a session. Only aggregates are saved.
- The active session lives only in React state, so a reload loses it.
- No inactivity auto-close and no "are you still here" alert exist yet.
- Dependencies `react`, `react-dom`, `vite`, `typescript` and others are set to `latest`.
- Question timing: re-timing an existing question number resumes its accumulated time. Keep this behavior.

## 2. Decisions already made (do not change without asking the owner)

1. **Offline-first, with session preparation.** A session never makes network calls while it is running, and must never hang waiting for the network.
   - **Practice sessions** (chapter-based) need no stored content and work fully offline.
   - **Revision sessions** (fact revision, question revision) need stored cards, questions and photos. Card and question text and metadata are kept on the device by the normal sync (section 4). Photos are the heavy part, so the app **prepares** a session while online: when the student agrees to a planned session (Today screen, Phase 4) or starts one manually, the app downloads every image that session needs and pins it in local storage. The plan is computed on the device from locally synced data, so the app should sync first when online so the plan reflects the latest data from the other device.
   - Once a session is **prepared** ("Ready for offline" state), it runs fully offline. Results are written locally and sync afterwards.
   - If a revision session is started while offline and some photos are not on the device, run it with what is available and show a clear "photo not downloaded" placeholder on affected cards. Never block.
2. **Single user, many devices.** Data syncs through Supabase with Row Level Security. Never put a service-role key or any secret in the frontend.
3. **A fact card cannot exist without a prompt** (typed text or a photo of a question). Its answer side is text and/or a photo.
4. **Links are many-to-many** between questions and fact cards, and can be created: (a) automatically from the feedback screen, (b) when creating a question card, (c) when creating a fact card, (d) later from the card detail screen.
5. **The owner picks which chapters matter** (tiers: must, fine, skip). The app shows data next to his choice but never overrides it.
6. **Simple, visible rules. No machine learning.** All scoring formulas must be plain functions with unit tests. The reasoning, the research findings and the full feedback-loop rules are in **section 10**. This is a single-user app with little data, so a transparent rule the owner can inspect and adjust beats a learned model, and every recommendation should be explainable in one line (for example "due for review" or "not practiced in 9 days").
7. **Cause list (version 1).** Shown only for results that are not "right". Exactly these values:

| `cause` value | Label | Meaning |
|---|---|---|
| `didnt_understand` | Didn't understand the question | Could not make sense of what was asked (unknown term or confusing wording) |
| `stuck_no_approach` | Stuck, no approach | Understood it, started, got stuck with no way forward |
| `slip` | Slip | Knew the method but made a calculation or silly error, or marked the wrong option |
| `missing_fact` | Missing fact or formula | Knew what was asked, but a fact, formula, reaction or exception was missing |
| `wrong_concept` | Wrong concept used | Applied a wrong rule or concept and reached a wrong answer |
| `not_sure` | Not sure | Cannot tell. Always available so he is never forced to guess |

   Optional `slip_subtype` (only when `cause = slip`): `calculation`, `sign`, `misread`, `marking`, `units_rounding`.
8. **Topics rule.** At least one topic is required when `cause` is `missing_fact` or `wrong_concept`. Otherwise topics are optional. This replaces the old rule that "couldn't solve" always requires a topic.
9. **Revision time budget.** About one hour per subject per block. Cap one fact-revision block at 35 cards.
10. **Photos go to Google Drive** (his own account), through a local upload queue. Cards and metadata stay in Supabase. A storage interface must keep this swappable (see Phase 1c).

## 3. Engineering rules for every phase

- Branch per phase (`phase-0-hardening`, `phase-1a-attempts`, and so on). Open a PR into `main`. CI (`Type check and production build`) must pass.
- `npm run build` must pass locally before every push.
- **Do not break existing data.** Existing saved sessions and their sync must keep working. Dexie upgrades must be additive, with `version(n+1)` and an `.upgrade()` only when needed.
- **Supabase migrations** go in `supabase/migrations/` with a timestamp prefix, idempotent where practical (`if not exists`), and each must be listed in the README with the order to run them. The owner runs them by pasting into the Supabase SQL editor.
- **Row Level Security on every new table.** Pattern for each table `T` with a `user_id` column:
  ```sql
  alter table public.T enable row level security;
  create policy "T select own" on public.T for select to authenticated using ((select auth.uid()) = user_id);
  create policy "T insert own" on public.T for insert to authenticated with check ((select auth.uid()) = user_id);
  create policy "T update own" on public.T for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  create policy "T delete own" on public.T for delete to authenticated using ((select auth.uid()) = user_id);
  grant select, insert, update, delete on public.T to authenticated;
  ```
- **Client-generated UUIDs** (`crypto.randomUUID()`) for every row, so records can be created offline.
- **Soft delete** (`deleted_at`) for cards, questions, links, so deletions sync between devices.
- **Code organization.** Stop growing `App.tsx`. New work goes in modules:
  ```
  src/features/practice/   (session flow, feedback)
  src/features/cards/      (question cards, fact cards, links, browse)
  src/features/revision/   (fact revision, question revision)
  src/features/today/      (tiers, recommendations)
  src/features/images/     (capture, compress, upload queue, storage providers)
  src/lib/                 (pure logic: scheduling.ts, scoring.ts, causes.ts)
  src/data/                (Dexie stores, sync, repositories)
  ```
  Phase 0 includes a behavior-preserving split of `App.tsx`.
- **Pure logic gets unit tests** (add Vitest). Scheduling, scoring and validation functions must be pure and tested.
- Mobile-first UI. Keep the existing visual style (CSS variables in `style.css`). One-handed use, large tap targets, no horizontal scrolling.
- Never log or persist secrets. Never commit `.env*` files.

---

## Phase 0: Hardening (small, do first)

**Goal:** no lost sessions, no surprise deploy breaks, and a codebase that can grow.

1. **Persist the active session.**
   - Add a Dexie store `activeSession` with a single row `id = "current"` holding the serialized `ActiveSession`.
   - Write on every state change (debounce about 300 ms) and on `visibilitychange` and `pagehide`.
   - On app load, if a row exists, show a "Resume session" screen with two buttons: Resume, Discard.
   - Use timestamps, not tick counts. On resume, recompute remaining time from `endsAt`. If `Date.now() > endsAt`, go straight to the feedback phase with `endedAt = endsAt`. If a question stopwatch was running, close it at `min(now, endsAt)`.
   - Delete the row when the session is saved or discarded.
2. **Inactivity rules** (agreed design, not yet implemented):
   - If no stopwatch is running and there has been no interaction for 10 minutes, auto-end the session (go to feedback; total time logged is the planned duration, active time is the sum of stopwatch time).
   - If one question's stopwatch has run 10 minutes with no interaction, show a modal "Still solving?" with a 10 second countdown. "I'm here" dismisses it and resets the 10-minute window. If the countdown reaches zero, close the session. The running question's time is counted only up to the moment the modal appeared.
   - Feedback is always shown after an auto-close.
3. **Pin dependency versions.** Replace every `latest` in `package.json` with the exact versions currently resolved in `package-lock.json`. Keep `.nvmrc`.
4. **Split `App.tsx`** into feature modules (no behavior change). Verify visually and with the build.

**Acceptance criteria**
- Reload during an active session restores the timers correctly and offers Resume/Discard.
- Idle and long-running-question rules behave as described (test with shortened constants via a config value).
- `npm run build` passes. `package.json` has no `latest`.

---

## Phase 1a: Per-question attempts and causes

**Goal:** save every timed question, with result, cause and topics, and show the cause picker in feedback.

### Data model

TypeScript:
```ts
type AttemptResult = "right" | "wrong" | "couldnt_solve";
type Cause = "didnt_understand" | "stuck_no_approach" | "slip" | "missing_fact" | "wrong_concept" | "not_sure";
type SlipSubtype = "calculation" | "sign" | "misread" | "marking" | "units_rounding";

type AttemptRecord = {
  id: string;               // uuid
  ownerUserId?: string;
  sessionId: string;
  questionNumber: number;
  questionId?: string;      // set in Phase 1b when linked to a question card
  timeMs: number;
  result: AttemptResult;
  cause?: Cause;            // required when result !== "right"
  slipSubtype?: SlipSubtype;
  topicIds: string[];       // syllabus topic ids
  note?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: "local" | "pending" | "synced";
};
```

Dexie version 4 (additive):
```ts
attempts: "&id, sessionId, [sessionId+questionNumber], questionId, result, cause, ownerUserId, syncStatus, updatedAt, *topicIds"
```

Supabase migration `YYYYMMDDHHMMSS_attempts.sql`:
```sql
alter table public.sessions
  add column if not exists session_kind text not null default 'practice'
  check (session_kind in ('practice','question_revision'));

create table public.attempts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  question_number integer not null check (question_number > 0),
  question_id uuid,
  time_ms bigint not null check (time_ms >= 0),
  result text not null check (result in ('right','wrong','couldnt_solve')),
  cause text check (cause in ('didnt_understand','stuck_no_approach','slip','missing_fact','wrong_concept','not_sure')),
  slip_subtype text check (slip_subtype in ('calculation','sign','misread','marking','units_rounding')),
  topic_ids text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attempts_cause_rules check (
    (result = 'right' and cause is null and slip_subtype is null)
    or (result <> 'right' and cause is not null)
  ),
  constraint attempts_slip_subtype_rule check (slip_subtype is null or cause = 'slip'),
  unique (session_id, question_number)
);
create index attempts_user_updated_idx on public.attempts (user_id, updated_at desc);
create index attempts_user_topics_idx on public.attempts using gin (topic_ids);
-- apply the RLS pattern from section 3.
```

Replace the sync RPC with `upsert_session_with_attempts(p_session jsonb, p_attempts jsonb, p_weak_topics jsonb)` that, in one transaction, upserts the session, upserts attempts (conflict on `id`, restricted to `auth.uid()`), and rebuilds `session_weak_topics`. Keep the old function for already-synced rows.

### Behavior

- **Feedback screen.** For each timed question: choose Right / Wrong / Couldn't solve (unchanged). If not Right, show the cause chips (single select, six options above). If `slip` is chosen, show optional subtype chips. Topic search (existing `SearchSelect`) is shown for any non-right result. Enforce the topics rule from section 2.
- **Validation** lives in `src/lib/causes.ts` as a pure function `validateAttempt(attempt): string[]` returning error messages. The Save button stays disabled while any attempt is invalid. Unit-test it.
- **Save.** In one Dexie transaction write the session record and all attempts. Existing aggregate fields on the session (`rightCount`, `wrongCount`, `couldntSolveCount`, `timedQuestionCount`, `activeTimeMs`, `avgTimePerQuestionMs`) are still written and must stay consistent with the attempts. `weakTopics` is now derived from topics on non-right attempts.
- **Sync.** Extend `cloudSync.ts`: push pending sessions together with their attempts through the new RPC; pull attempts for synced sessions.
- **Summary screen.** Keep the current numbers. Add a small breakdown of causes for this session.
- **Old sessions** have no attempts. Leave them alone.

**Acceptance criteria**
- A session with 5 timed questions saves 5 attempt rows locally and in Supabase, with correct causes and topics.
- Save is blocked if a non-right attempt has no cause, or has `missing_fact`/`wrong_concept` with no topic.
- Works fully offline, and syncs later with no duplicates when "Sync now" is pressed twice.
- Old sessions still display and sync.

---

## Phase 1b: Question cards, fact cards, links (text only)

**Goal:** capture the fix material and connect it.

### Data model (Supabase)

```sql
create table public.questions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text not null,
  chapter_id text not null,
  topic_ids text[] not null default '{}',
  prompt_text text,
  prompt_image_id uuid,            -- used in Phase 1c
  solution_text text,
  solution_image_id uuid,          -- used in Phase 1c
  key_insight text,                -- one line: the trick or the thing to remember
  source text,                     -- optional free text (book or sheet name)
  times_seen integer not null default 1,
  last_seen_at timestamptz,
  priority_boost smallint not null default 0 check (priority_boost between 0 and 3),
  boost_updated_at timestamptz,
  created_from_attempt_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint questions_has_prompt check (prompt_text is not null or prompt_image_id is not null)
);

create table public.fact_cards (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text not null,
  chapter_id text not null,
  topic_ids text[] not null default '{}',
  kind text not null default 'fact' check (kind in ('fact','formula','reaction','misconception','trap')),
  prompt_text text,
  prompt_image_id uuid,
  content_text text,
  content_image_id uuid,
  wrong_belief text,               -- for kind = 'misconception': what he wrongly believed
  stage smallint not null default 0,
  due_at timestamptz not null default now(),
  reps integer not null default 0,
  lapses integer not null default 0,
  last_reviewed_at timestamptz,
  created_from_attempt_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint fact_has_prompt check (prompt_text is not null or prompt_image_id is not null),
  constraint fact_has_content check (content_text is not null or content_image_id is not null)
);

create table public.question_fact_links (
  question_id uuid not null references public.questions (id) on delete cascade,
  fact_id uuid not null references public.fact_cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (question_id, fact_id)
);

create table public.fact_reviews (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  fact_id uuid not null references public.fact_cards (id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  outcome text not null check (outcome in ('recalled','forgot')),
  stage_before smallint not null,
  stage_after smallint not null,
  source text not null check (source in ('fact_revision','question_revision')),
  attempt_id uuid
);

alter table public.attempts
  add constraint attempts_question_fk foreign key (question_id) references public.questions (id) on delete set null;
-- indexes: (user_id, chapter_id), gin(topic_ids), (user_id, due_at) on fact_cards,
-- (user_id, updated_at) on every table for sync pulls. Apply the RLS pattern to all four new tables.
```

Dexie version 5 (additive): `questions`, `factCards`, `links` (compound key `[questionId+factId]`), `factReviews`, each with `ownerUserId`, `syncStatus`, `updatedAt` indexes and `*topicIds` where relevant.

### Behavior

1. **From the feedback screen**, for every non-right attempt:
   - Button **Save to question bank**: opens a form with question text (required until Phase 1c adds the photo option), solution or approach text, key insight (one line), optional source. Subject, chapter and topics are prefilled from the attempt. Saving sets `attempt.questionId` and `question.created_from_attempt_id`.
   - If cause is `missing_fact` or `wrong_concept`: button **Add fact card**. The form requires a prompt and content. For `wrong_concept` default `kind = 'misconception'` and show the `wrong_belief` field. Every fact card created here is **automatically linked** to the attempt's question card (create the question card first if the owner has not already; if he has not, prompt him to save it).
   - Link picker: **Link existing fact card**, a searchable list limited to the same chapter first.
2. **Standalone creation** (from a "Cards" tab): create a fact card (prompt required) with optional question attachments; create a question card with optional fact links. Both forms include a link picker.
3. **Duplicate guard.** When saving a new question or fact card, show up to 5 existing cards from the same chapter or topics ("Is this one already saved?"). Tapping **Same one** links the current attempt to that existing question instead of creating a copy, and increments `times_seen` and `last_seen_at`.
4. **Cards tab (browse).** Filters: subject, chapter, topic, type (question or fact), cause (derived from the latest linked attempt). List view with prompt preview. Card detail shows linked cards, history (attempts and reviews) and Edit/Delete (soft delete).
5. **Sync.** Extend `cloudSync.ts` into a generic table sync (see section 4) covering these tables.
6. **Navigation.** Add a bottom nav: Practice, Cards, History. (Revise and Today are added in later phases.)

**Acceptance criteria**
- Creating a fact card from a feedback screen auto-links it to that attempt's question card, and the link appears in both detail screens.
- A fact card cannot be saved without a prompt, or without content.
- Duplicate guard links instead of duplicating.
- Everything works offline and syncs without duplicates, including links and soft deletes, on two devices.

---

## Phase 1c: Photos, local upload queue, Google Drive

**Goal:** attach photos to prompts, solutions and answers without ever blocking on the network.

### Storage abstraction

```ts
interface ImageStore {
  upload(blob: Blob, meta: { id: string; mime: string }): Promise<{ remoteId: string }>;
  download(remoteId: string): Promise<Blob>;
  remove(remoteId: string): Promise<void>;
}
```
Implementations: `DriveImageStore` (build now) and `SupabaseImageStore` (optional, behind the same interface, off by default).

### Pipeline

1. **Capture:** `<input type="file" accept="image/*" capture="environment">`, plus a "choose from gallery" option.
2. **Compress on device before saving:** resize so the long edge is at most 1600 px, JPEG quality about 0.7 using canvas (`createImageBitmap` plus `OffscreenCanvas` when available). Target at most about 250 KB per photo. Reject non-image files.
3. **Save locally first.** Dexie store `images` (metadata: `id`, `ownerUserId`, `mime`, `width`, `height`, `bytes`, `status: pending | uploading | uploaded | failed`, `remoteId?`, `attempts`, `lastError?`, `createdAt`) and `imageBlobs` (`id`, `blob`). The card references the image by `id` immediately, and the photo is viewable from the local blob straight away.
4. **Upload queue:** a background loop uploads `pending` and `failed` items. Triggers: app start, `online` event, after capture, a manual "Retry uploads" button. Exponential backoff (for example 5 s, 30 s, 2 min, 10 min, then hourly). Retry on network errors and 5xx. After a 401, refresh the token and retry. Never mark `uploaded` until the provider confirms. Delete the local blob only after confirmation (keep a small thumbnail cache of at most about 200 recent images). Full-size images belonging to a **prepared session** (Phase 4) are pinned and must not be evicted until that session is saved or discarded.
5. **Metadata sync:** a Supabase table `images` (`id`, `user_id`, `provider`, `remote_id`, `mime`, `width`, `height`, `bytes`, `created_at`) with RLS. The card rows carry `*_image_id` pointing at it. The other device downloads from Drive on demand, or in advance when preparing a session, and caches locally.
6. **UI status:** show a small "waiting to upload" badge on cards with pending photos and a global pending count. Pending photos must never block saving a card.

### Google Drive provider

- Use **Google Identity Services** (token model, browser-only). Scope: `https://www.googleapis.com/auth/drive.file` only.
- Client ID from `VITE_GOOGLE_CLIENT_ID`. **Never** use or store a client secret in the frontend.
- On first upload, create a folder named "JEE Practice" and remember its id in Dexie (and in the user's Supabase profile row, so the second device reuses it).
- Upload with the Drive v3 multipart endpoint. Display with an authenticated `files/{id}?alt=media` fetch into a blob URL.
- Access tokens last about an hour. Request a fresh one silently when needed. Handle "popup blocked" and "consent needed" with a clear in-app message and a "Reconnect Google Drive" button.
- **Owner prerequisite (document in the README, the agent cannot do this):** create a Google Cloud project, enable the Drive API, configure the OAuth consent screen, create an OAuth Web client ID with authorized JavaScript origins (production hostname and `http://localhost:5173`), and **publish the consent screen to production** (apps left in "Testing" have authorizations that expire after seven days). The `drive.file` scope is the non-restricted one, so no heavy verification should be needed. The owner will confirm current steps in the Google Cloud console.

**Acceptance criteria**
- With the network off, a photo can be attached, the card saves, and the badge shows pending. After reconnecting, it uploads without any action and the badge clears.
- Interrupting an upload (airplane mode mid-upload) leaves it retryable, never lost, never duplicated.
- A photo taken on the phone is visible on the laptop.
- Compressed photos are at most about 300 KB in a manual test with a 4 MB phone photo.

---

## Phase 2: Fact revision

**Goal:** scheduled recall of fact cards.

### Scheduling (`src/lib/scheduling.ts`, pure and unit-tested)

Leitner-style ladder. `INTERVAL_DAYS = [1, 3, 7, 14, 30]` indexed by `stage`.
- New card: `stage = 0`, `due_at = now`.
- **Recalled:** `stage = min(stage + 1, 4)`, `due_at = now + INTERVAL_DAYS[stage] days`, `reps += 1`.
- **Forgot:** `stage = 0`, `due_at = now + 1 day`, `lapses += 1`.
- Always write a `fact_reviews` row.
- Keep the scheduler behind one function interface so FSRS-style scheduling can replace it later (`nextSchedule(card, outcome, now) -> {stage, dueAt, ...}`).
- Prefer a lower retention target and a daily cap over exhaustive review, since there is a fixed exam date.

### Selecting today's cards

- Only cards in chapters not marked `skip`.
- Due cards first (`due_at <= now`), most overdue first, then by chapter tier (must before fine).
- Cap: 35 cards per block. The owner picks the subject(s) for the block.

### Session UI

- Show the prompt (text or photo). Button **Show answer**. Then two buttons: **Recalled** / **Forgot**.
- Progress indicator and a clear "Done for now" end state with a summary (recalled, forgot, next due date).
- Works offline once the block has been prepared (decision 1): preparation downloads the block's card photos in advance. The card selection is frozen into a planned session when the student agrees (see Phase 4).

### Feedback into questions

When a card is marked `forgot`, for each linked question: `priority_boost = min(priority_boost + 1, 3)`, `boost_updated_at = now`. The boost decays by 1 per 7 days (computed on read, not by a job).

**Acceptance criteria**
- Unit tests cover next-due calculation for every stage and both outcomes.
- A forgotten card appears again the next day.
- Forgetting a card raises the boost of all its linked questions (capped at 3).

---

## Phase 3: Question revision session

**Goal:** a practice-style session whose questions come from the stored question bank.

- Reuse the existing session UI (global timer, per-question stopwatch, feedback). New session kind `question_revision` (the column was added in Phase 1a). The question list is frozen into a planned session when the student agrees (Phase 4), and its photos are downloaded during preparation so the session runs offline.
- **Selecting questions** (pure function in `src/lib/scoring.ts`, unit-tested):
  - Eligible: question's chapter is not `skip`.
  - `score = tierWeight * (1 + boostEffective) * recencyFactor * unseenBonus`
  - `boostEffective = max(0, priority_boost - floor(daysSince(boost_updated_at) / 7))`
  - `recencyFactor = clamp(daysSince(last_seen_at) / 7, 0.1, 2)`. Questions seen in the last 2 days get a factor of at most 0.1 (to avoid memorized answers inflating signals).
  - `unseenBonus = 1.5` if `times_seen = 1` and it has never been revisited.
  - `tierWeight`: must = 3, fine = 1.
  - Pick the top N by score with a small random tie-break, and no more than 40% from one chapter.
- **During the session**: show the question prompt (text or photo). The stopwatch rules are unchanged.
- **Feedback for a revision question:**
  - Right: `times_seen += 1`, `last_seen_at = now`. Optional: if the question has linked facts and it was right and within the time target, treat each linked fact as lightly reinforced (log a `fact_reviews` row with outcome `recalled`, source `question_revision`, but do not advance the stage by more than one and never more than once per 3 days).
  - Not right: ask the normal cause. If the cause is `missing_fact` or `wrong_concept`, show the linked facts and let him tap **which linked fact(s) he missed** (multi-select, plus "None of these", plus "Add new fact card"). Each selected fact is treated as `forgot` (same rule as fact revision) and logged with source `question_revision`. If the cause is `slip` or similar, **no fact is blamed**. If the cause is `stuck_no_approach` or `didnt_understand`, raise that question's own `priority_boost` by 1 (cap 3) so it returns sooner.
- Offer to attach the new attempt to the stored question (it is, by construction), and bump `times_seen`.

**Acceptance criteria**
- Unit tests for the question-selection score, including the recency suppression and the 40% chapter cap.
- A wrong answer with cause `slip` does not change any fact card.
- A wrong answer with a selected fact resets that fact to stage 0 and raises the boost of its other linked questions.

---

## Phase 4: Chapter tiers and the "Today" screen

**Goal:** one button that decides what to do, with the owner always in control.

- **Tiers:** new table `chapter_prefs (user_id, chapter_id, tier text check in ('must','fine','skip'), updated_at)` with RLS and Dexie mirror. Default tier is `fine`. A "Chapters" settings screen lists all chapters by subject, with a three-way toggle per chapter. Tiers are the owner's decision; the app never changes them.
- **Today screen** (new first tab):
  - Suggested plan: which subjects, and time split (practice vs revision), produced by the scores below. He can toggle subjects (all three, or one or two) and change times. His choices always win.
  - Revision block(s): due fact cards, with count and time estimate. Practice suggestions: top chapters by `practicePriority`.
  - **Mirror, not override:** if a chapter is marked `skip` but data suggests it is strong or high-yield, show a one-line note ("You marked Probability as skip, but you scored 80% there last month"). No automatic change.
- **Plan agreement and preparation (new):**
  - New Dexie store `plannedSessions`: `{ id, kind: 'practice' | 'fact_revision' | 'question_revision', subjectIds, chapterIds?, cardIds?, questionIds?, scheduledFor?, status: 'planned' | 'preparing' | 'prepared' | 'started' | 'done' | 'discarded', createdAt }`. Sync it only if the owner wants cross-device plans (optional).
  - When the student **agrees** to a suggested plan (an "Agree and prepare" button, possibly for a later day), freeze the list of cards or questions into the plan so it does not change.
  - While online, run `prepareSession(plan)`: sync first, download every missing image the plan needs, pin them, and show progress ("Preparing 12 of 30") then a clear **Ready for offline** state. Preparation can run ahead of time (for example tonight for tomorrow's plan) and must be resumable if the connection drops.
  - While offline, preparation is paused and resumes automatically when online. A plan whose assets are all present is `prepared`.
  - Starting a `prepared` plan makes no network calls. Discarding or finishing a plan unpins its images.
- **`practicePriority(chapter)`** (pure, tested): `tierWeight * (recencyGap + volumeGap + weakness)` where
  - `recencyGap = clamp(daysSincePractice / 7, 0, 3)`
  - `volumeGap = clamp(1 - recentQuestionCount / targetCount, 0, 1)` (default `targetCount = 30` over the last 14 days; keep configurable)
  - `weakness = 1 - masteryDecayed`
  - `mastery` = exponential moving average (alpha 0.2) over attempts, where an attempt counts as 1 only if `result = right` and `timeMs <= targetTimeMs` (default 180000), and as 0.5 if right but slow, otherwise 0.
  - `masteryDecayed = mastery * exp(-daysSincePractice / 21)`
  - Rules: never recommend the same chapter on consecutive days; add a small random jitter (+/- 5%) for variety; skip chapters marked `skip`.
- Make all constants live in one config file with comments.

**Acceptance criteria**
- Tier changes take effect on the next Today render and are synced.
- Unit tests for `practicePriority` including decay and the no-consecutive-days rule.
- Overrides never get reverted by the app.
- Prepare a revision plan online, switch the phone to airplane mode, and the full session (including photos) runs and saves locally. Results sync after reconnecting.
- Preparation can be interrupted and resumed without re-downloading finished images.

---

## Phase 5: Analytics (laptop-first)

Build after about two weeks of real data. Minimum set:
- Cause breakdown per subject and per chapter over time; slip-subtype profile (top two slip types, shown on the Practice start screen as a reminder).
- Average time per question vs the 2 to 3 minute target, per chapter.
- Active time vs planned time (focus ratio) per session.
- Accuracy and mastery trend per chapter.
- Fact retention: recalled / reviewed per week.
- Optional toggle on a session "I used a 20-second check at the end of each question" and a comparison of slip rates with and without it.

---

## 4. Sync design (applies from Phase 1a on)

- Every synced table has `id uuid`, `user_id`, `updated_at`, and (where deletable) `deleted_at`. Every Dexie row has `syncStatus` and `updatedAt`.
- **Push:** in dependency order (`sessions`, `questions`, `fact_cards`, `attempts`, `question_fact_links`, `fact_reviews`, `images`, `chapter_prefs`), upsert all `pending` rows with `onConflict: 'id'` (or the RPC for sessions with attempts). Mark `synced` only after success. Batch up to 100 rows per request.
- **Pull:** per table, fetch rows with `updated_at > lastPullCursor[table]` ordered by `updated_at`, page through, and apply. Last-write-wins on `updated_at`, but never overwrite a local row that is still `pending`. Store cursors in a Dexie `meta` store. Full pulls are fine at this scale (low thousands of rows).
- Set `updated_at` on the client when a row changes, and let a database trigger also bump `updated_at` on update to avoid clock skew problems.
- All sync is retryable and idempotent. Surface status in the existing sync indicator.

## 5. Testing plan

- **Unit tests (Vitest):** `validateAttempt`; `nextSchedule` (every stage, both outcomes); `selectQuestions` scoring; `practicePriority`; image compression size bounds; boost decay.
- **Manual test script per phase** (put in `docs/TESTING.md`): offline flow, reload mid-session, two-device sync, duplicate protection, deletion sync, photo queue interruption, prepare a revision session online then run it in airplane mode.
- CI runs type check, build and unit tests.

## 6. Security and privacy checklist

- RLS enabled and policies present for every table (verify with a query listing `pg_policies`).
- No service-role key anywhere in the repo or the build variables.
- Drive scope is `drive.file` only. Photos are not public links.
- Do not log photo contents or question text to the console in production.
- Add `docs/` and the root chat log files to the owner's attention: the repo is currently public and contains personal chat logs; recommend making the repo private or removing them.

## 7. Out of scope for now

FSRS scheduling (the interface allows it later); OCR or image-similarity duplicate detection; AI-generated questions; sharing or multi-user features; push notifications.

## 8. Open items to confirm with the owner before the relevant phase

1. Phase 1c: confirm he has created the Google Cloud project and published the consent screen (instructions in the README).
2. Phase 2: whether "Hard" should be a third grade, and the exact daily card cap (default 35 per subject block).
3. Phase 4: how far ahead the app should prepare (default: the next agreed plan; optionally the next day's plan overnight), `targetCount` per chapter for "volume gap", and the default time target per question (default 3 minutes).
4. Whether to keep `Practice session.html`, `chat-1.md`, `chat-2.md` and `design asset/` in the repo.

## 9. Suggested order and PR checklist

Order: Phase 0, 1a, 1b, 1c, 2, 3, 4, 5.
Every PR must include: what changed in plain language; migration filenames and the order to run them; manual test steps; screenshots of new screens (mobile width); confirmation that `npm run build` and tests pass; and a note on any change to existing behavior.

---

## 10. Recommendation and feedback-loop design: findings and rationale

This section records what was researched and why the rules look the way they do, so future changes are deliberate. If a constant here differs from a phase section, change both and keep one config file as the source of truth.

### 10.1 It is two problems, not one

1. **Recall scheduling** (fact cards): decide when each card should come back. This is a well-studied problem (spaced repetition). Do not invent a new method.
2. **Practice recommendation** (which chapter or question next): no standard tool fits a single user with a few months of data. Use a transparent priority score built from signals the app already records.

The two are linked by the question-to-fact links (10.4).

### 10.2 Findings from the spaced repetition research

- Modern schedulers (the FSRS family, which Anki has supported since version 23.10) frame the goal as a prediction problem: estimate, for each card, when the probability of recalling it falls to a chosen target, and show the card then. The model tracks three quantities per card: difficulty, stability, and retrievability.
- The one setting a user controls is **desired retention** (default about 90%). Higher retention means shorter intervals and many more reviews per day. One source reports that 97% roughly doubles the daily workload for a small gain, and FSRS tooling can simulate workload for a chosen number of days, for example the time until an exam, to pick an efficient value.
- Implication for this app: the exam date is fixed, so the goal is the best recall by that date at a workload that can be sustained (about one hour per subject), not lifelong memory. Prefer a moderate retention target and a daily cap over exhaustive reviewing.
- The scheduler's input is the learner's honest self-grade after each card. Honesty of that tap is the main weak point of the whole system (see 10.5).
- FSRS-6 is reported to have shipped in late 2025, trained on hundreds of millions of reviews from about twenty thousand users, and works with default parameters out of the box. Personalizing parameters needs a large number of reviews of one's own.

### 10.3 Why a Leitner ladder first, and how to move to FSRS later

- With a fixed horizon of weeks to a few months and a small card count at the start, a ladder of intervals (1, 3, 7, 14, 30 days) is simple, explainable, and good enough. It also needs no tuning.
- **Keep the migration path open:** log every review with timestamp, outcome, stage before/after and source (already in `fact_reviews`). That history is exactly what an FSRS-style scheduler needs, so it can be adopted later by implementing the one function `nextSchedule(card, outcome, now)`. Do not scatter scheduling logic elsewhere.
- Planned retention target for the ladder: aim for the observed recall rate of due cards to sit around 85 to 90%. See tuning in 10.6.

### 10.4 The feedback loop between fact cards and questions

Why it works: a fact is best tested by a real question that needs it, and a failed question usually exposes a specific fact. Results therefore flow in both directions, with guards against blaming the wrong card or flooding the student.

| Event | Effect on fact cards | Effect on questions |
|---|---|---|
| Fact revision: **Recalled** | `stage + 1` (max 4), next due per ladder, `reps + 1` | none |
| Fact revision: **Forgot** | `stage = 0`, due in 1 day, `lapses + 1` | each linked question: `priority_boost + 1` (cap 3) |
| Question revision: **right** and within the time target | each linked fact lightly reinforced: log `recalled` with source `question_revision`, advance at most one stage, at most once per 3 days per fact | `times_seen + 1`, `last_seen_at = now` |
| Question revision: **right but slow** | no fact change | seen; counts 0.5 toward mastery |
| Question revision: wrong, cause `missing_fact` or `wrong_concept`, student taps the missed fact(s) | each tapped fact: treated as **Forgot** (row above) | seen; other questions linked to those facts get the boost via the Forgot rule |
| Question revision: wrong, cause `slip` | **none** (no fact is blamed) | seen; slip statistics only |
| Question revision: wrong, cause `stuck_no_approach` or `didnt_understand` | none | this question's own `priority_boost + 1` (cap 3) |
| Question revision: wrong, cause `not_sure` | none | seen only |

**Credit assignment rule:** a failed question never blames facts automatically. Blame is applied only to facts the student explicitly taps, and only when the cause is `missing_fact` or `wrong_concept`.

**Memorized-answer guard:** seeing the same question again can test the memory of the answer rather than the fact. So (a) questions seen in the last 2 days get a strongly reduced selection score, (b) a fact's reinforcement from questions is capped (above), and (c) a fact backed by several different questions is the more trustworthy signal.

**Flood guard:** boosts are capped at 3 and decay by 1 per 7 days (computed on read); at most half of any revision session may be boosted items; at most 40% of a session may come from one chapter; a revision block is capped at 35 fact cards.

### 10.5 Honest data rules

- `not_sure` is always available so the student is never forced to guess a cause.
- "Slip" must mean: the method was understood and an error occurred. Keep the label wording and the help text clear so it is not used as a default excuse.
- Sessions that auto-close still log (with the total/active time rule), so bad sessions are recorded automatically.
- No live nudges during a session; the app analyzes afterwards.

### 10.6 Practice recommendation: the score and its parts

`practicePriority(chapter) = tierWeight * (recencyGap + volumeGap + weakness)` (see Phase 4 for the formula text). Rationale for each part:

- **Recency gap:** neglected chapters must rise on their own, including easy chapters that students tend to skip.
- **Volume gap:** for Maths and Physics, the number of recent questions solved in a chapter is the main driver of readiness.
- **Weakness:** mastery is an exponential moving average of attempts where an attempt scores 1 only if it was right and within the time target, 0.5 if right but slow, otherwise 0. This ties accuracy to the speed goal. Mastery decays with days since practice, using the same forgetting idea as the cards.
- **Tier weight:** the owner's own choice of chapters (must, fine, skip). The app never changes tiers and shows data next to his choice instead.
- **Variety:** small random jitter and a no-same-chapter-on-consecutive-days rule.
- **Cold start:** no random trials. With no data, rank by tier and by chapters never practiced (coverage first), then let real data take over.

### 10.7 Constants (keep in one file, `src/lib/config.ts`)

| Constant | Default | Used for |
|---|---|---|
| `INTERVAL_DAYS` | `[1, 3, 7, 14, 30]` | Fact ladder |
| `FACT_BLOCK_CAP` | 35 | Cards per revision block |
| `BOOST_MAX` | 3 | Question priority boost cap |
| `BOOST_DECAY_DAYS` | 7 | One boost point lost per 7 days |
| `RECENT_SUPPRESS_DAYS` | 2 | Memorized-answer guard |
| `UNSEEN_BONUS` | 1.5 | Selection score |
| `CHAPTER_CAP_PCT` | 0.4 | Max share of one chapter in a session |
| `BOOSTED_MAX_PCT` | 0.5 | Max share of boosted items in a session |
| `TIER_WEIGHT` | must 3, fine 1, skip excluded | Scores |
| `TARGET_TIME_MS` | 180000 | Right-and-fast definition |
| `MASTERY_ALPHA` | 0.2 | Mastery moving average |
| `MASTERY_DECAY_DAYS` | 21 | Mastery decay |
| `VOLUME_WINDOW_DAYS` / `VOLUME_TARGET` | 14 / 30 | Volume gap |
| `RECENCY_GAP_DAYS` | 7 | Recency gap scale |
| `JITTER_PCT` | 0.05 | Variety |
| `LINK_REINFORCE_MIN_GAP_DAYS` | 3 | Fact reinforcement from questions |

### 10.8 Evaluating and tuning (after about two weeks of real use)

- **Fact recall rate at due time:** fraction of due cards marked Recalled. If well above about 90%, intervals are too short (too much work); if below about 80%, too long.
- **Suggestion acceptance:** how often the owner keeps the "Today" suggestion unchanged. Frequent overrides signal a bad weight.
- **Mastery change per hour practiced** in recommended chapters versus others.
- **Slip rate trend** per chapter and subtype.
- Change one constant at a time and note the change and the date in a short changelog in `docs/TUNING.md`. Optionally add a disabled-by-default "explore" slot (one of five suggestions chosen at random from eligible chapters) to test the ranking later.

### 10.9 References for the implementer

- Anki manual, "What spaced repetition algorithm does Anki use?" (https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm)
- FSRS wiki, "The Optimal Retention" (https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-optimal-retention)
- Blog post "Spaced repetition recap" on domenic.me (https://domenic.me/fsrs/)
