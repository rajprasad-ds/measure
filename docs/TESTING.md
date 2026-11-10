# Manual test checklist

## Phase 1a: Attempts and causes

1. Run `supabase/migrations/20261110194500_attempts.sql` after the existing
   session migrations. Sign in on the app and confirm cloud sync still loads
   prior sessions.
2. Start a session and time at least five questions. In feedback:
   - Save is disabled until every timed question has a result.
   - For each non-right result, choose one cause.
   - `Missing fact or formula` and `Wrong concept used` require at least one
     topic; other causes allow topics to be empty.
   - `Slip` offers optional subtypes.
   - Changing a question to Right clears its cause, subtype, and topics.
3. Save and confirm the summary retains the existing result totals and shows a
   breakdown by cause.
4. In browser developer tools, inspect the local IndexedDB `jee-practice`
   database. Confirm one `attempts` row exists per timed question, including
   the correct result, cause, subtype, topic IDs, and time. Confirm question
   numbers are not stored in attempt rows.
5. Sign out or go offline before saving another session. Confirm session and
   attempt rows are saved locally, then sign in/go online and use **Sync now**.
   Repeat **Sync now** and confirm no duplicate attempts appear on the device
   or in Supabase.
6. Import existing device-only sessions. Confirm they sync without generated
   attempts and previously synced sessions remain visible.

## Phase 1b: Cards and links

1. Apply `supabase/migrations/20261110201500_cards.sql` after the attempts
   migration. Confirm the new tables show RLS enabled in Supabase.
2. From **Cards**, create a question with prompt text and a key insight but no
   solution; verify it saves. Try with neither solution nor insight and verify
   it is rejected. Create a fact card and verify both prompt and answer are
   required.
3. Create a fact card linked to a question, then open both details and confirm
   the link appears in both directions. Unlink and soft-delete cards; verify
   they leave the active list.
4. From feedback, mark an attempt `missing_fact` or `wrong_concept`, add a
   topic, save a question card and then add a fact card. Verify the fact links
   automatically to that question, and saving the session adds the question ID
   to its attempt without saving a question number.
5. Create or find a similar question from feedback. Choose **Same one** and
   confirm no duplicate is created, the attempt links to the existing card, and
   its `timesSeen` value increases.
6. With an account, sync cards and links. Press **Sync now** twice and confirm
   no duplicates. On another device, pull and check the same cards, links, and
   soft-deleted state.

## Practice feedback and local images

1. In a practice session, stop a question at one minute or less and mark it
   right. Confirm there is no smarter-approach prompt.
2. Stop another question after one minute and mark it right. Confirm the
   app nudges you to look for a shorter approach:
   - Reflection: "You spent mm:ss on this question. Did you find one worth saving?"
   - **Not this time** immediately completes feedback for this question without cards.
   - **Yes, save my approach** strictly asks for one task at a time:
     - **Step 1 of 3: Question photo:** upload a clear photo of the question.
     - **Step 2 of 3: Attach topics:** search and select syllabus topics, with a small visual preview of the uploaded question.
     - **Step 3 of 3: Smarter approach:** upload a photo of the shorter method and optional note.
   - Back navigation returns to the prior step without losing progress.
3. Mark a question wrong or unsolved. Confirm the flow moves strictly one task at a time:
   - **Step 1: Question photo:** upload a photo of the question (or pick "Use existing" if duplicate).
   - **Step 2: Attach topics:** search and select syllabus topics, with a small visual preview of the uploaded question.
   - **Step 3: Solution photo:** upload a photo of the textbook/correct solution (or skip if not available yet).
   - **Step 4: Root cause:** select one of the six root causes.
   - **Step 5 (conditional):**
     - If `slip`: pick slip subtype (calculation, sign, misread, marking, units).
     - If `missing_fact` or `wrong_concept`: memory cue screen offering to create a fact card, link an existing one, or skip.
     - If other causes: finishes immediately without extra screens.
   - Confirm back navigation works across all steps.
4. Confirm feedback handles one question at a time, step changes slide in the
   chosen direction, progress is clear, and Next is disabled until the current
   question is complete.
5. Capture a question and solution photo from camera and gallery. Confirm
   each is compressed, survives a reload, and appears in card detail.
6. Confirm the Cards screen cannot create a new question card. Existing
   question cards remain editable. A revision-session feedback flow must never
   offer new-question creation.
7. Photos currently stay local to the device. Confirm synced cards on another
   device show a clear missing-photo notice rather than a broken image; Drive
   upload/download is not enabled yet.
