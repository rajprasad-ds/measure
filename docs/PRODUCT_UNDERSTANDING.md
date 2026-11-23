# Measure — Product Understanding & Current-State Gap Analysis

**Prepared:** 23 November 2026  
**Repository:** [rajprasad-ds/measure](https://github.com/rajprasad-ds/measure)  
**Reviewed branch:** `phase-1b-cards`  
**Purpose:** Capture the product direction established in the product-discovery discussion and compare it with the implementation currently present in the repository. This is a product-alignment document, not an implementation specification or a claim that every detail is finalized.

---

## 1. Product vision

Measure is intended to become a personal, adaptive JEE revision and practice system.

Its central promise is that the student should not have to decide every day what to revise. Measure should use the student's question bank, fact bank, syllabus structure, previous performance, retention history, time taken, and available study time to prepare useful revision sessions automatically.

The system should steadily repair weaknesses while maintaining already-developed ability through occasional retention checks. It should make accumulated competence visible through honest, useful numbers—not public competition, XP, levels, badges, or decorative gamification.

The system should be explainable. When it selects a question or fact, the student should eventually be able to understand why it was selected.

**Important:** Measure can help detect weaknesses, schedule retrieval, and show evidence of progress. It must not claim to guarantee mastery.

## 2. Core product principles
## Account and identity requirement — Step 1

A Google account sign-in is mandatory before a student can use practice sessions, create or edit question/fact cards, or store application data. Anonymous use and email/password account creation are not part of the Step 1 product.

- Use Google as the identity provider through Supabase Auth. Every session, attempt, question card, fact card, relationship and image metadata record must be associated with the authenticated Supabase user ID.
- Do not create new unassigned/anonymous practice data. Existing local unassigned data from earlier builds may be offered for explicit import into the signed-in account; never silently claim it.
- Google account sign-in and Google Drive file authorization are related but distinct permissions. The user signs into Measure with Google; Drive file access (the limited `drive.file` scope) may require a separate Google consent step when image backup is first used.
- If Drive authorization is unavailable or revoked, preserve images locally and show a clear sync state; do not silently discard them.
- Signing out must block access to account-owned application data until the user signs in again. Do not expose another account's cached records.


1. **Automate revision decisions.** The student sets time and allocation constraints; Measure chooses the material.
2. **Separate workflows.** Normal question practice, question revision, and fact revision are distinct session types.
3. **Collect useful data without cluttering the interface.** The app may store detailed raw data, but the home screen should display only high-priority information. Detailed comparisons and charts belong in Analytics.
4. **Use committed data only.** A session affects history, scheduling, metrics, and streaks only after its required feedback is submitted successfully.
5. **No fake progress.** Attempted, solved, and retained/mastered are different concepts and must not be conflated.
6. **Personal progress, not social competition.** Metrics should show accumulated competence and improvement against the student's own history.
7. **No workload backlog.** Missed revision work does not automatically accumulate into the next day.
8. **Keep data entry low-friction.** Avoid adding fields that do not materially improve revision decisions or analytics.

---

## 3. The three session types

### 3.1 Normal question practice

The student solves questions from an external book or source. Measure is primarily a smart timer and end-of-session feedback workflow; it is not choosing the questions. This is the **Step 1 workflow** and must be completed and hardened before implementing revision sessions.

**Practice-session context**
- At session setup, the student selects the subject and chapter only. Topic selection is deliberately not part of creating a session.
- Whenever topic attribution is required for an individual question or card, the student selects one or more topics through a searchable topic picker. Topic selection happens in the relevant question-feedback/card workflow, not globally at session start.
- Questions are solved outside Measure. The app tracks time and captures useful feedback/question-bank data.
- The question image is mandatory whenever a question is added to the question bank; typing a full PCM question is not a realistic substitute.

**The five outcomes and their normal-practice behavior**

1. **Right and fast**
   - Record the outcome and duration in practice history.
   - Do not add a question-bank card.
   - Move to the next question.

2. **Right but slow**
   - Record the outcome and duration.
   - Ask whether the student knows a faster/better method.
   - If **no**, do not add a question-bank card; move on.
   - If **yes**, capture a new question-bank entry in this order:
     1. Upload the question image.
     2. Add the faster solution/method (text, images, or both).
     3. Assign intrinsic difficulty (Easy / Medium / Hard).
     4. Save the new question.
   - This is the first capture of this question in normal practice. Do not assume an existing solution/card is present or describe the faster method as an update to an existing solution.

3. **Wrong**
   - The student must select exactly **one primary diagnostic cause**.
   - Then adding the question to the question bank is mandatory.
   - Capture order:
     1. Select the primary cause.
     2. Upload the question image.
     3. Add the solution (text, images, or both; at least one is required).
     4. Assign intrinsic difficulty (Easy / Medium / Hard).
     5. If the cause is **Forgot a fact/formula**, resolve the dependency by linking an existing fact card or creating a new fact card. The question cannot be saved until this is done.
     6. Save the question.
   - The question inherits subject/chapter from the session. The student assigns its topic or topics using the searchable topic picker in the feedback workflow.

4. **Couldn't solve**
   - Uses the same mandatory diagnostic and question-capture sequence as **Wrong**.
   - Exactly one primary cause is selected, using only options relevant to this outcome.
   - If the cause is **Forgot a fact/formula**, the fact dependency must be resolved before the question can be saved.

5. **Wrong question**
   - Record the outcome and duration in practice history.
   - Do not ask for a diagnostic cause.
   - Do not add a question-bank card.
   - Do not count it as an accuracy/weakness signal.
   - Immediately move to the next question.

**Diagnostic taxonomy for Wrong and Couldn't solve**
- Use one shared underlying taxonomy so analytics remain consistent, but show outcome-appropriate options/wording in the interface.
- The student selects exactly one primary cause, not multiple causes.
- Shared cause concepts:
  - Conceptual misunderstanding.
  - Forgotten fact or formula.
  - Calculation or execution slip (relevant to an attempted-but-wrong answer, not generally to an unsolved question).
  - Incorrect problem-solving approach / couldn't identify an approach.
  - Didn't understand or misinterpreted the question.
  - Other / unsure.
- Store the practice outcome and diagnostic cause as separate data fields.

**Question and solution capture rules**
- A question image is mandatory.
- A solution must contain at least one of text or image; both are allowed. Multiple solution images are allowed and their order must be preserved.
- Intrinsic difficulty is mandatory for every question-bank entry and is assigned by the student: **Easy**, **Medium**, or **Hard**. It is the question's intrinsic classification, not a changing measure of the student's personal difficulty/performance.
- A correct-but-slow capture stores the faster method as the solution for this newly created question entry. It does not replace or append to a pre-existing solution.
- Question-bank capture is conditional for correct answers, mandatory for Wrong/Couldn't solve, and skipped for Wrong question.

Normal practice is not question revision. The app does not choose a revision set during this workflow. **Do not import revision-session feedback assumptions into this workflow.** Repeated attempts on existing question cards and updates to their revision state belong to the later revision-system design.

### 3.2 Question revision

The system selects questions already stored in Measure's question bank. The student attempts them again and provides feedback.

Expected behavior:
- Selection is driven by a future explainable priority algorithm.
- No fixed subject quotas or simulated JEE paper composition. The three-hour JEE format is not a requirement to imitate the actual paper.
- Subject allocation should adapt to the student's needs.
- The system should address weak areas while occasionally checking retention of strong areas.
- A saved question remains eligible for future revision; its priority can become very low, but it should not be permanently discarded merely because it was mastered once.
- Personal difficulty can evolve from performance, but the original/intrinsic difficulty assigned when adding the question should be preserved separately.
- If a question is linked to facts, a forgotten fact may raise the question's priority. Links are optional; the engine must work when no link exists.

**Question revision lifecycle**
- A question revision session cannot be paused and resumed.
- The student can finish all selected questions or click **End session** early.
- Either action opens the feedback screen.
- The feedback screen shows **all selected questions**.
- Questions with duration greater than zero receive the normal feedback flow.
- Questions with zero duration are unattempted; they receive no feedback and their question metrics are not updated.
- Feedback submission commits the session and eligible question updates.
- Cancelling/leaving without submitting discards the session and causes no revision-metric or scheduling updates.

If a question was failed because a fact was forgotten, a linked fact can receive a priority increase when a link exists. Without a link, the question weakness is still recorded.

### 3.3 Fact revision

The system selects facts from the fact bank. The interaction is intentionally simple:

1. Show the front/prompt.
2. Student recalls mentally.
3. Reveal the back/answer.
4. Student reports one of:
   - **Remembered**
   - **Partially remembered**
   - **Forgotten**

No quiz formats or elaborate interaction types are wanted for this workflow.

Expected scheduling behavior:
- Successful recall should generally increase the next interval.
- Partial recall should keep the next review relatively close (or increase it only modestly).
- Forgotten facts should return to an early review interval.
- Scheduling should consider past outcomes, elapsed time, and consecutive successful recalls.
- Fact and question revision engines are distinct, but can influence each other through optional question–fact links.
- The precise scheduler (for example, a Leitner-style system or FSRS-inspired approach), intervals, and formulas have **not** been finally approved.

**Fact revision lifecycle**
- Fact sessions can be paused and resumed across study intervals.
- Preserve the exact selected facts and current position when paused.
- Only one session may be active at a time; a paused fact session retains that slot and must be resumed, completed, or discarded before another session starts.
- If an unfinished fact session is still incomplete at the end of the day, discard it. Do not carry it forward as backlog.
- Unsubmitted feedback means no session completion and no revision metrics/scheduling updates.

---

## 4. Session persistence and commit rules

The governing rule is:

> A session is meaningful to the revision history only after its required feedback has been submitted.

- Feedback appears at the end of the session workflow.
- Saving/submitting feedback completes the session.
- Cancelling or leaving without submission discards the session.
- No partial session history, partial feedback, question/fact metrics, or scheduler changes should be committed.
- A paused fact session is temporary working state, not a completed review.
- Question revision cannot be resumed after interruption; it goes through its end/feedback path and is committed only if feedback is submitted.
- A zero-duration question in an early-ended question revision session is unattempted and must not have its metrics updated.

This implies that the implementation needs a clear distinction between temporary session state and committed records, with atomic/transactional commit behavior where appropriate.

**Still to clarify later:** The new discussion explicitly defines the non-resumable behavior for question revision and resumable behavior for fact revision. It does not fully revisit the interruption/reload policy for normal question-practice sessions. The current repository does preserve active practice sessions across reloads (see Section 9), so that behavior must not be silently changed without deciding it.

---

## 5. Study availability and daily revision planning

Measure must understand the student's configured study schedule, not just a daily number of hours.

### 5.1 Study intervals

- The student can configure different study intervals for different days of the week.
- Example schedule:
  - 08:00–12:00
  - 13:00–18:00
  - 19:00–23:00
- Measure determines which intervals have passed, which are active, and which are upcoming.
- Study availability includes **all study activities**, including normal question practice. It is not exclusively revision time.

### 5.2 Revision allocation

The student separately decides how much of the available study time to dedicate to Measure revision sessions and how to divide that revision time between:
- Question revision
- Fact revision

Example:
- Total study availability: 14 hours.
- Revision allocation: 5 hours.
- Question revision: 60% = 3 hours.
- Fact revision: 40% = 2 hours.
- Remaining study time is available for other work, including normal question practice.

The question/fact ratio is user-controlled. The system must not impose equal subject quotas.

### 5.3 Refreshing the plan

- Recalculation is **user-triggered**. Measure should not silently regenerate the plan merely because an interval has passed.
- The student can request a refresh after missing a study interval or when their availability changes.
- On refresh, Measure recalculates remaining study availability and can let the student change the revision allocation based on the time left.
- The generated workload must realistically fit the remaining time. It must not compress an impossible amount of work into the remaining hours.
- Unstarted generated sessions are replaced when the plan is refreshed.
- Completed sessions remain recorded.
- No missed workload backlog is carried into tomorrow; tomorrow's plan is generated from the latest committed data.
- Manual adjustment of an already-generated session's duration is **not** desired. The student changes availability/allocation and requests a refresh instead.

### 5.4 Session concurrency

Only one active session at a time. A paused fact revision session continues to occupy the active-session slot. The student cannot start another revision session until the paused one is resumed, completed, or discarded.

---

## 6. Streak and daily completion

The home screen shows **one combined streak**, not separate practice and revision streak counters.

A successful day requires both:
1. At least one completed normal question-practice session.
2. At least one completed revision session (question revision **or** fact revision).

Both sessions must reach their completed state through feedback submission. An unfinished or cancelled session does not count.

- Multiple sessions of the same type do not compensate for the missing other type.
- Missing either requirement breaks the combined daily streak.
- Track the current streak and the longest personal-best streak.
- The home screen displays the combined streak only.
- Analytics may show the separate practice/revision consistency breakdown and explain which requirement was missed.

The streak is a consistency indicator, not a substitute for learning metrics.

---

## 7. Metrics and information architecture

### 7.1 Home screen

The home screen is the first screen opened. Its purpose is to make accumulated progress visible and motivate further practice/revision. It should be concise and numerical, not a chart dashboard.

Expected high-priority information:
- Today's progress alongside cumulative progress.
- Questions successfully solved (with meaningful distinctions from attempted questions).
- Question difficulty distribution.
- Fact retention: successfully retained facts out of total facts, with a clearly defined meaning of “retained.”
- Progress/coverage across subjects, chapters, and topics in compact form.
- Current combined streak and personal best.
- A list of revision sessions prepared for today. Tapping a session starts it.
- A compact numerical view of today's activity and cumulative achievements.

Today's progress should update as completed feedback is submitted. Cumulative achievement totals should be reconciled/updated at the end of the day from committed records, without double-counting.

**Do not put charts, graphs, detailed subject comparisons, or long historical breakdowns on the home screen.** The user explicitly wants those in Analytics.

### 7.2 Analytics section

Analytics is a separate section for detailed exploration. Candidate measures include:
- Questions solved per week/month.
- Growth in successful retention.
- Changes in difficulty distribution.
- Weaknesses resolved over time.
- Average time per question.
- Average time by subject, difficulty, chapter, and topic.
- Correctness alongside solving time (faster is not automatically better if accuracy falls).
- Practice vs revision activity and streak requirement breakdown.
- Question/fact coverage and retention history.

Charts and comparisons belong here. The exact analytics layout and filters have not yet been designed; UI/UX discussion is intended to proceed layer by layer, starting from the top-level structure.

### 7.3 Intrinsic motivation

Avoid public leaderboards, social comparison, XP, levels, collectible badges, or points whose only purpose is accumulation.

Metrics should help the student answer:
- What have I actually learned or retained?
- How many questions have I successfully solved, and at what difficulty?
- Where have I practiced across the syllabus?
- Which weaknesses have I fixed?
- Is my retention becoming more durable?
- Is my solving time improving without sacrificing correctness?

---

## 8. Revision-selection algorithm: direction, not final formula

Question and fact selection must eventually use explicit, testable rules rather than arbitrary/random selection.

Potential signals already discussed:
- Previous outcomes and repeated failures.
- Successful attempts and whether they were spaced apart.
- Time taken, including correct-but-slow attempts.
- Time since last attempt/review.
- Prior revision history and improvement.
- Topic-level weakness and coverage.
- JEE Main topic relevance/weightage, when reliable PYQ statistics are supplied.
- Optional links between questions and facts.
- Balance between repairing weaknesses and checking retention of stronger material.

Important constraints:
- JEE weightage must not overwhelm personal weakness.
- No fixed subject-wise quotas.
- No requirement to simulate the JEE paper's subject/difficulty composition.
- A question that has improved should not necessarily outrank one with an unresolved weakness.
- Mastered material should receive occasional retention checks rather than being permanently removed.
- If the bank is too small to fill the desired session, use lower-priority eligible material rather than arbitrarily leaving the session empty.
- Each selected item should eventually have a short, truthful explanation of why it was selected.

No final weights, score formula, scheduler, or interval table has been approved.

---

## 9. Current GitHub implementation (reviewed 23 November 2026)

### 9.1 Repository snapshot

- Reviewed branch: `phase-1b-cards`.
- Branch comparison against `main`: **2 commits ahead, 0 behind** at review time.
- Stack from `package.json`/README: React 19, TypeScript, Vite, Dexie/IndexedDB, Supabase, PWA, Cloudflare Workers.
- README describes the app as an offline-ready installable PWA for timed JEE practice sessions.
- Current navigation component exposes three tabs: **Practice**, **Cards**, and **History**.

### 9.2 What already exists

**Normal practice foundation**
- Timed practice session UI with a global session timer.
- Per-question stopwatch and temporary question number.
- End-session action and a multi-step feedback screen.
- Feedback supports outcomes, causes, topic tagging, question capture, solutions, and fact-card creation/linking flows.
- Session summary/history data.
- Active practice session persistence in IndexedDB and a recovery screen offering Resume/Discard.
- Inactivity/long-question prompts are present in the practice UI and lifecycle module.

**Question and fact bank foundation**
- Question cards and fact cards are stored locally and can sync.
- Cards carry subject, chapter, topic IDs, timestamps, and soft-delete metadata.
- Question cards support prompt/solution content and image references.
- Fact cards support kinds such as fact, formula, reaction, misconception, and trap.
- Optional many-to-many question–fact links exist.
- Card browsing/creation UI and image input/display components exist.
- Fact card schema already has scheduling-like fields: `stage`, `dueAt`, `reps`, `lapses`, and `lastReviewedAt`.
- Fact review records exist with outcomes currently represented as `recalled` or `forgot`, plus before/after stage and source.

**Data and sync foundation**
- IndexedDB/Dexie stores sessions, attempts, questions, fact cards, links, fact reviews, image metadata/blobs, and active-session state.
- Supabase migrations create session/attempt/card/link/review/image-related tables and RLS policies.
- Session/attempt synchronization uses transaction-safe RPC logic.
- README documents offline-first local writes and later sync.
- Syllabus data is supplied from `syllabus.json`.

### 9.3 What is not yet present or is materially different from the agreed product

| Product requirement | Current repository state | Gap |
|---|---|---|
| Home screen as progress dashboard | Current navigation is Practice / Cards / History | No agreed home dashboard structure or consolidated achievement view |
| Dedicated Analytics section | Existing History tab and stored session data | No dedicated analytics information architecture or full analytics experience established |
| Today's and cumulative achievement metrics | Raw sessions/attempts/reviews exist | Metrics and end-of-day aggregation/reconciliation are not established as the agreed product |
| Combined streak + personal best | Not found in current navigation/data model reviewed | Streak calculation and display need design/implementation |
| Today's prepared revision-session list | No Today/revision-planning tab in current navigation | No generated session list or plan-refresh workflow |
| Study intervals by weekday | No schedule model/UI identified in reviewed code | Needs new settings/data model and time-aware planning |
| Revision-time allocation and question/fact split | Not identified in current implementation | Needs settings and planning logic |
| User-triggered refresh based on remaining availability | No such workflow identified | Needs plan generation and refresh behavior |
| Adaptive question revision | Question cards exist; no revision-session engine identified | Selection algorithm, session execution, feedback, scheduling updates are still needed |
| Fact revision front/back workflow | Fact cards and review-record schema exist; no fact-revision screen identified | Session UI, pause/resume, feedback, and scheduler behavior are still needed |
| Three fact outcomes | DB review outcome currently supports `recalled` / `forgot` | Needs a representation for **Partially remembered** and revised scheduling behavior |
| Question revision early-end feedback rules | Existing feedback screen is built around timed practice attempts | Needs question-revision-specific behavior, including zero-duration unattempted questions |
| Question revision cannot pause/resume | Generic active-session recovery exists for current practice workflow | Revision session lifecycle needs to be distinct; do not reuse practice recovery blindly |
| Fact revision can pause/resume across intervals | Active-session persistence exists for current practice sessions | Needs fact-specific persistence semantics and end-of-day discard |
| One active session at a time | Current app has a single active-session state for its current workflow | Need to extend/define this across the new session types |
| Average time by subject/topic/difficulty analytics | README describes average time per question and attempt timing data | Detailed analytics views and comparisons are not established |
| Explain why a question/fact was selected | No revision recommender in current app | Needs transparent scoring/explanation model |

### 9.4 Important existing behavior that conflicts with or must be reconciled against the new direction

The current README states that an in-progress session and feedback are saved locally, and after reload/reopen the app offers **Resume session** or **Discard session**. The current recovery screen is part of the practice-session workflow.

The new product discussion makes the session types different:
- Fact revision may be paused/resumed.
- Question revision cannot be paused/resumed.
- A session is committed only when feedback is submitted.
- Question revision has a special early-end feedback screen containing every selected question; zero-duration items are unattempted and must not update question metrics.

The existing generic practice-session recovery must therefore not be treated as the final lifecycle design for all future session types. The normal practice-session interruption policy should be confirmed before changing its existing behavior.

The current fact-review database outcome is binary (`recalled` / `forgot`), whereas the agreed fact feedback has three outcomes. This requires a schema/domain update, not just a UI label change.

The current navigation has no separate Home and Analytics destinations. The product's new information architecture must be designed before UI implementation is started.

### 9.5 Existing documentation is not the final source of truth

The repository's `v2-implementation plan .md` contains earlier decisions and planned phases. Some of those assumptions have now been refined or superseded by this discussion—for example, generic session recovery, the earlier Today flow, and the old fact-review outcome model.

Treat this document as the current product-understanding snapshot. Before implementation, reconcile the older plan with the product decisions here rather than blindly following outdated assumptions.

---

## 10. Suggested UI/UX discussion sequence

The owner wants to discuss UI/UX **layer by layer, from the top-level structure down into each area separately**. Do not jump into detailed component styling before agreeing on the information architecture.

Suggested order:

1. **Application shell and top-level navigation** — primary sections, navigation behavior, responsive/mobile vs laptop layout.
2. **Home screen** — priority order of metrics, today's progress vs cumulative progress, prepared revision-session list, streak placement.
3. **Analytics** — information hierarchy, metric definitions, filters, charts, drill-down paths.
4. **Practice workflow** — setup, timer, question numbering, end-session feedback, completion.
5. **Question revision workflow** — session presentation, solving interaction, early end, feedback.
6. **Fact revision workflow** — front/back interaction, pause/resume, progress preservation.
7. **Question/fact bank** — add/edit/browse, links, image handling.
8. **Settings** — weekly study intervals, revision allocation, subject/syllabus preferences, account/sync.
9. **System states** — empty states, offline states, refresh, interrupted sessions, errors, and confirmations.

The next discussion should start at **Layer 1: application shell and top-level navigation**. Continue asking one question at a time.

---

## 11. Open decisions to resolve later

These are intentionally not guessed:
- Exact top-level navigation and responsive layout.
- Exact home-screen metric order and definitions.
- Whether cumulative metrics are computed live from committed records or materialized at day-end (the visible behavior requested is that today's progress is shown alongside cumulative progress and today's totals roll into cumulative totals at day-end).
- Definition of a fact being “successfully retained” for dashboard counting.
- Whether question counts mean unique questions ever solved, successful attempts, or both (the UI should distinguish these).
- Exact definition of difficulty categories and whether intrinsic difficulty is already stored in the current card model.
- Exact time-estimation model for questions/facts when generating sessions.
- Exact question-selection and fact-scheduling formulas.
- Exact behavior if a generated plan cannot be filled from the available card bank.
- Whether normal practice sessions retain their current reload/recovery behavior.
- Whether a normal practice session and a revision session can ever overlap (the current agreed rule is one active session at a time, with a paused fact session blocking another session).
- Timezone/day-boundary details for schedules and streaks.
- Exact fact-session completion/feedback commit mechanics and end-of-day cleanup behavior.
- Whether the user may explicitly adjust revision allocation during a refresh; the current direction is yes.

---

## 12. Implementation readiness assessment

The repository has a meaningful foundation: normal practice timing and feedback, card storage, optional question–fact links, offline-first persistence, cloud sync, and image handling are already present.

However, the central adaptive-revision product is **not yet implemented**. The largest missing pieces are:
1. New application information architecture (Home and Analytics).
2. Weekly study schedule and revision allocation.
3. Time-aware daily plan generation and user-triggered refresh.
4. Question revision engine and its distinct lifecycle.
5. Fact revision UI, three-state feedback, and scheduler.
6. Explainable selection/prioritization logic.
7. Achievement/streak/analytics definitions and presentation.

The next step is product/UI discussion, not immediate coding. Once the top-level structure and each screen's responsibilities are agreed, the product requirements and implementation plan can be reconciled with the current branch before work begins.


---

## 13. Delivery strategy: two major steps

The owner has clarified that completion should happen in **two major steps**, and this sequencing takes precedence over the UI/UX discussion sequence above.

### Step 1 — Complete and harden the question-practice + data-capture foundation

The first milestone is not the adaptive revision planner. It is to make the existing normal question-practice workflow reliable end to end, including:

- Starting and completing a normal question-practice session.
- Capturing the per-question outcomes, time, causes, topics, and relevant difficulty information.
- Adding question cards and their solution/approach content.
- Adding fact cards when appropriate.
- Creating optional links between questions and facts.
- Persisting all text and metadata correctly in the database.
- Persisting images correctly to the intended image store (Google Drive) and maintaining reliable references to those images.
- Ensuring local persistence, cloud synchronization, ownership, and offline behavior do not lose or mis-associate records.

A critical part of Step 1 is a **data sufficiency audit**. Before beginning the revision planner, inspect the actual database schema, repositories, migrations, feedback flow, and sync paths to establish that the information being captured is sufficient for the future planner and analytics.

At minimum, the audit should map each future requirement to:
1. The exact data needed.
2. Whether the app currently captures it.
3. Where it is stored (local schema and remote schema).
4. Whether it is reliably persisted and synchronized.
5. Whether its meaning is unambiguous and historically usable.
6. Any missing field, migration, validation, or workflow change needed now.

The audit must pay particular attention to whether the current data can support:
- Question identity and content, including solution/alternative approach.
- Subject, chapter, and topic attribution.
- Intrinsic difficulty, kept distinct from evolving personal difficulty/observed performance.
- Per-question duration and outcome.
- Cause of failure and slip subtype where relevant.
- Repeated attempts and their timestamps.
- Question revision history in the future.
- Fact identity/content/type and three-state recall outcomes in the future.
- Fact review timestamps, interval/scheduling state, and consecutive recall history.
- Optional question–fact relationships.
- Successful vs unsuccessful retention, not merely whether a card exists.
- Question/fact coverage by subject, chapter, and topic.
- Accurate average solving-time analytics.
- Session completion/feedback submission state, with no partial commits counted as completed work.

Do not assume a field exists just because the UI displays it, or that it is durable just because it exists in React state or IndexedDB. Trace the full path from user input through local persistence, remote schema, sync, and later retrieval. Do not add speculative metadata fields; each field must have a clear future use and a reliable definition.

**Step 1 exit criteria:** the normal practice workflow is usable end to end; question/fact capture and linking work; text, metadata, and images are reliably stored and synchronized; and a documented data audit confirms that the stored data is sufficient for the planned revision engine—or lists the specific remaining gaps that must be closed before Step 2.

### Step 2 — Build the adaptive revision planner and its workflows

Only after Step 1's exit criteria are met should implementation move to the revision system:

- Study availability and weekly intervals.
- Revision allocation and question/fact split.
- Time-aware daily session preparation and user-triggered refresh.
- Adaptive question selection and question-revision lifecycle.
- Fact front/back revision and three-outcome feedback.
- Spaced scheduling and cross-influence through optional links.
- Explainable prioritization.
- Home progress metrics, combined streak, and Analytics.

The detailed UI/UX design should still proceed layer by layer, but it must respect this delivery order. Product discovery can define the eventual Home and Analytics structure now; implementation priority remains Step 1 first.

### Practical rule for future development

Before implementing any Step 2 feature, ask: **Does Step 1 already capture the raw, trustworthy data this feature will need?** If not, close that data-capture/persistence gap first. The revision planner should not be blocked later by missing historical data that could have been captured during normal practice.


---

## 14. Normal-practice feedback corrections from live testing (23 November 2026)

The owner tested one session containing all four outcome paths and identified three issues that must be resolved before Step 1 is considered complete.

### 14.1 Fact dependency screen

When the primary cause is Forgotten fact/formula, the user must be able to:
1. Search and link an existing fact card from the user's full fact library.
2. Or deliberately choose to create a new fact card.

The existing-fact search must be visible and usable before the new-card form is opened. Do not force the user into a large creation form. The screenshot from testing did not expose the existing-card option, even though a CardPicker exists in the current source; verify the rendered UI and ensure the search is clearly visible above/beside a collapsed create-new action.

### 14.2 Images remain local until final session submission

Selecting an image is not consent to upload it to Google Drive. During feedback the user may replace a photo, remove it, or navigate backward and change the answer. Therefore:
- Image selection saves the image locally in IndexedDB and displays a preview.
- Do not request Drive authorization or upload the image when it is selected.
- Replacing/removing a photo must only update the local draft.
- After the user submits the complete session, upload only the images referenced by the final committed question/fact cards.
- Complete image uploads before presenting the final session summary as fully synchronized. If upload or sync fails, preserve the committed local session and image blobs, clearly show which items remain pending, and offer retry. Never lose local work because Drive is unavailable.

### 14.3 Feedback must be draft-first and reversible

Live testing exposed a data-integrity bug: submitting a question photo creates a QuestionCard immediately and assigns its ID to the attempt. If the user navigates backward and changes the outcome, that old question ID can remain attached to the new outcome.

Required behavior:
- Feedback steps collect a draft; they must not create or sync permanent question/fact cards or relationships while the user is still navigating the form.
- Changing an outcome invalidates dependent draft fields (cause, slip subtype, topics, question/solution/difficulty draft, and fact dependency as applicable) without leaving a card or link behind.
- The final session submission validates all drafts and commits sessions, attempts, question cards, fact cards, and question-fact links transactionally in local storage.
- Only after the local transaction succeeds should referenced images become eligible for Drive upload and records become eligible for cloud sync.
- A failed local commit must not partially create cards, links, or attempts. A later Drive/cloud failure must not roll back or destroy the locally committed session.
- The attempt's questionId must always refer to the card created/selected for its final outcome, never a card from a previously selected outcome.

### 14.4 Presentation quality

The current feedback UI feels cluttered despite the palette being acceptable. Redesign the feedback steps around one primary task per screen:
- Strong hierarchy and concise instructions.
- Progressive disclosure: keep fact creation, optional details, and secondary actions collapsed until requested.
- Clear existing-fact search vs create-new choice.
- Consistent spacing, card density, button hierarchy, and step labels.
- Preserve the five outcomes and agreed capture order; do not change product behavior merely to simplify the interface.

These corrections remain part of Step 1. Do not begin Step 2 revision workflows while they are unresolved.


### 14.5 Implementation status — reversible drafts

Implemented on `phase-1b-cards`:
- Question photo, solution, smarter-method, difficulty, fact-card and existing-fact selections are staged in the active session feedback object rather than immediately creating new permanent cards or links.
- Changing the selected outcome clears all dependent draft data and any previous attempt card reference.
- Question and fact card records plus their question-fact links are prepared before the final write, then inserted in the same IndexedDB transaction as the session and attempts.
- Existing selected fact cards are validated and linked at final submission; locally owned cards are assigned to the authenticated user in that same transaction.
- Only images referenced by final cards are queued for Drive upload after the local transaction succeeds. The active feedback image-selection path saves blobs locally and does not itself queue uploads.
- Feedback completion checks recognize staged question and fact drafts even though they do not yet have persistent card IDs.
- Cloud sync failure after local commit does not block the session summary.

Verification: GitHub Actions completed successfully for the draft-flow and local-only-draft tests (27 tests passed; TypeScript check and production build passed). Browser-level testing of replacing photos, changing outcomes, final commit rollback, Drive upload and cloud sync is still required before Step 1 sign-off.

---

## 15. Current handoff status — 23 November 2026 (latest)

This section supersedes any older status statements above where they conflict. It is intended as the pickup point for another coding agent.

### 15.1 Branch and workflow constraints

- Repository: `rajprasad-ds/measure`.
- Active working branch: `phase-1b-cards`.
- Latest branch HEAD checked for this handoff: `9ab0d3edbc9766e2111d5e8e1dac32f2afe7b779` — “Exclude invalid questions from session total validation”.
- Continue all Stage 1 investigation, implementation, and testing on `phase-1b-cards`.
- `main` is not the working source of truth for this task. Do not switch implementation to `main`, merge, rebase into `main`, or deploy from `main` unless the owner explicitly asks.
- Do not begin Stage 2 implementation. Finish and verify the Stage 1 normal-practice and data-capture foundation first.
- Preserve the current test data for now. The owner has explicitly deferred the full test-data cleanup until Stage 1 is finished. Do not delete local IndexedDB records, Supabase rows, or Drive files as part of routine testing.

### 15.2 Confirmed fixes and latest live-test result

**Reversible feedback drafts and atomic local commit** (see Section 14.5):
- Feedback edits are staged in the active session rather than creating permanent cards/links as the user moves through the flow.
- Changing an outcome clears dependent draft values and stale card references.
- Session, attempts, new question/fact cards, and question–fact links are committed together in an IndexedDB transaction.
- Only images referenced by the final committed cards become eligible for Drive upload.
- A later Drive/cloud failure must not destroy the locally committed session.

**Invalid-question session totals / cloud-sync mismatch:**
- The reported error was: `Could not sync a session: Session totals do not match its attempts`.
- The frontend intentionally keeps `wrong_question` rows in attempt history but excludes them from valid timed-question count and active-time/average calculations.
- The Supabase RPC had been using the older aggregate behavior and was counting those rows in the totals, causing the mismatch.
- The migration `supabase/migrations/20261123180000_exclude_invalid_attempts_from_session_totals.sql` was applied manually in the Supabase SQL Editor by the owner.
- The owner inspected the deployed `public.upsert_session_with_attempts(jsonb,jsonb,jsonb)` definition and confirmed it now calculates valid-attempt totals separately from total persisted attempt rows. It excludes `wrong_question` from the session's valid count/time aggregate while still inserting all attempt rows.
- After applying the migration, the owner clicked **Sync now** and reported: **“Sync successful.”**
- Treat this specific sync error as resolved for the tested case; do not re-open it without new evidence.

### 15.3 Remaining verification before Stage 1 sign-off

The successful sync is a useful confirmation, but it is not complete end-to-end verification. Continue with the following:

1. **Historical session verification:** confirm previously created sessions containing `wrong_question` sync and display consistently after reload/re-fetch. Verify the invalid-question attempt row is retained, while the session timed-question count, active time, average time, accuracy, and weakness signals exclude it as intended.
2. **Fresh-session verification:** create a new small practice session containing a mix of valid outcomes and at least one `wrong_question`; submit feedback and sync. Confirm no mismatch, no duplicate attempts, and correct summary/history values.
3. **Attempt persistence:** verify that every timed question has exactly one persisted attempt and that the attempt remains retrievable after reload and cloud pull.
4. **Feedback reversibility in the browser:** change an outcome after entering data; verify dependent draft values and card references are cleared and no abandoned card/link is created.
5. **Fact dependency flow:** verify existing fact search is visible and usable before opening the create-new fact form; test both linking an existing fact and creating a new one.
6. **Image lifecycle:** select, replace, and remove question/solution/fact images before final submission. Confirm no Drive upload or Drive consent is triggered merely by selecting an image. After final submission, verify only final referenced images upload, image order is preserved, and failed uploads remain retryable without losing local data.
7. **Atomicity and recovery:** test failed final local commit/validation and confirm no partial session, attempt, card, or link is left behind. Separately test Drive/cloud failure after local commit and confirm the local session remains available with a clear pending/error state.
8. **Offline and account ownership:** create data offline, reconnect and sync without duplicates; verify data remain scoped to the authenticated user and sign-out does not expose cached records to another account.
9. Run the automated checks (`npm test`, `npm run build`) on the current branch and complete the manual checklist in `docs/TESTING.md`.

**Documentation discrepancy to fix:** `docs/TESTING.md` currently says in its session-summary checklist that Wrong question is included in total timed questions. That conflicts with the current implementation and the deployed RPC behavior: Wrong question is retained as an attempt-history row, but excluded from the valid timed-question count and the active-time/average calculations. Update that checklist wording on `phase-1b-cards` when appropriate, and inspect the rest of the testing document for any other stale migration names or instructions before relying on it.

### 15.4 Test-data cleanup is explicitly deferred

The owner decided not to perform a reset now. Continue testing with the existing test records.

After Stage 1 has passed its exit criteria, plan a separate, deliberate cleanup of test data across:
- Browser IndexedDB/local storage used by Measure.
- User-owned Supabase application rows (sessions, attempts, weak topics, question/fact cards, links, reviews, and image metadata).
- Only the corresponding test image files in Google Drive.

The cleanup must preserve the Google/Supabase account, OAuth/Drive authorization, application configuration, schema, migrations, and RPCs. It must be scoped to the authenticated user's test data and verified before destructive execution. Do not prepare or run a broad project reset. The owner has not yet confirmed whether the Drive location contains only Measure test images, so identify the exact test files before deleting anything.

### 15.5 Recommended pickup sequence for the next agent

1. Read this document, especially Sections 13–15, and `docs/TESTING.md`.
2. Confirm the checked-out branch is `phase-1b-cards` and inspect its current HEAD and working tree before editing.
3. Inspect the current source and migrations rather than assuming this handoff is newer than the repository.
4. Start with the remaining browser verification in Section 15.3, particularly historical and fresh-session sync after the RPC migration.
5. Fix any confirmed Stage 1 defects and update the testing checklist alongside behavior changes.
6. Do not implement adaptive revision planning, spaced repetition, Home/Analytics dashboards, or other Stage 2 features as part of this handoff.
7. Do not clean test data or merge to `main` without the owner's explicit approval.
