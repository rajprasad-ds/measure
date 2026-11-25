# Measure — Product Understanding & Current-State Gap Analysis

**Updated:** 24 November 2026  
**Repository:** [rajprasad-ds/measure](https://github.com/rajprasad-ds/measure)  
**Current baseline:** `main` (Phase 1B merged)  
**Purpose:** Preserve the product direction, settled decisions, implementation context, known limitations, and current handoff state. This is the living product-understanding document; it distinguishes product requirements from implementation status and items that still need verification.

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

**Normal question-practice interruption behavior (decided 24 November 2026):**
- Normal practice cannot be intentionally paused and resumed later.
- If the app is closed or interrupted while the student is solving questions, the next launch must take the student to that session's feedback workflow rather than back into question-solving. The captured work is recovered for feedback; solving does not continue.
- Time while the app is closed is downtime and must not be counted as question-solving or practice duration. Preserve the active time/question durations accumulated before interruption.
- If the app closes while feedback is in progress, restore the feedback workflow exactly where the student left it, including completed feedback, in-progress drafts, text, selected images, and the current question/step.
- Feedback remains temporary draft state until the student submits the complete session. If feedback is not completed by the end of the originating study day (defined by the end of that day's final configured study interval), discard the unfinished practice session and its uncommitted attempt/card/link drafts. It must not affect history, metrics, scheduling, or streaks.
- Independently saved fact cards are separate records and must survive discarding an unfinished session.

---

## 5. Study availability and daily revision planning

Measure must understand the student's configured study schedule, not just a daily number of hours.

### 5.1 Study intervals

- The student configures a recurring weekly schedule by selecting which weekdays are **OFF** and configuring one or more study intervals for each non-OFF weekday.
- An OFF day has no study intervals: no study activity may be started and no study activity/time is recorded for that day.
- The weekly schedule is the single source of truth; the app fetches the applicable weekday's intervals when a new calendar day begins (after midnight).
- That day's fetched intervals are fixed for the remainder of that day. Editing the weekly schedule during the day does not change today's intervals; the updated schedule takes effect from the next calendar day.
- Past days and their actual activity records are never rewritten by later schedule changes. There is no need to create separate daily copies of the recurring schedule merely to preserve it; the day uses the schedule values established at its start.
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

**Question and fact bank foundation**- Question cards and fact cards are stored locally and can sync.
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

The existing generic practice-session recovery must therefore not be treated as the final lifecycle design for all session types. The normal-practice interruption policy is now decided in Section 4: unexpected closure sends the student to recoverable feedback, not back to question-solving; closed-app downtime is excluded from practice duration.

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
- Whether a normal practice session and a revision session can ever overlap (the current agreed rule is one active session at a time, with a paused fact session blocking another session).
- Timezone/day-boundary details for schedules and streaks (the schedule day boundary is midnight in the user's configured/local timezone; the authoritative timezone implementation still needs verification).
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

**Scope clarification:** This draft-first rule applies to question/fact capture inside an unfinished normal-practice feedback workflow. It does not apply to a fact card deliberately created and saved independently from a session in the Cards/fact-bank workflow. Independent fact cards are committed local records immediately; their text and image backup lifecycle is described in Section 16.10. Session-created cards remain staged with the session and are committed with the session's final feedback submission.

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

## 15. Historical handoff status — 23 November 2026 (superseded)

This section records the handoff state before the Phase 1B merge. Its branch instructions, test-data instructions, and outstanding-work list are historical and are superseded by the current handoff in Section 16.10.

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

---

## 16. Product decisions from the 24 November 2026 discovery session

This section records decisions made after the 23 November handoff. Where this section conflicts with older wording above, this section is authoritative.

### 16.1 Normal question-practice session recovery and duration

- A normal question-practice session cannot be intentionally paused and resumed.
- Unexpected app closure ends the solving phase. On the next launch, recover the session into its feedback workflow; do not return the student to active question-solving.
- Preserve the question attempts and active durations captured before closure. Time while the app is closed is downtime and must not inflate question-solving or practice duration.
- If closure occurs during feedback, restore the feedback workflow exactly where it was left, including completed answers, current draft, text, selected images, and current question/step.
- A practice session is committed only after the complete feedback workflow is submitted.
- If feedback remains incomplete at the end of the originating study day, discard the unsubmitted session and its uncommitted attempts, question-card drafts, and links. No session history, stats, scheduling, or streak changes result.
- Fact cards that were independently saved immediately are independent records and must not be deleted when an unfinished practice session is discarded.

### 16.2 Weekly schedule, OFF days, and daily interval freezing

- The user configures a recurring weekly schedule: each weekday is either **OFF** or has one or more study intervals.
- An OFF day means no study intervals, no permitted study activity, and no recorded study activity/time for that day.
- For a non-OFF day, the app fetches the intervals for that weekday from the current weekly schedule when the calendar day begins (after midnight). The fetched intervals are fixed for that day.
- A weekly schedule edit made during the day does not alter that day's intervals. The updated weekly schedule is used from the next calendar day.
- Past days and historical activity are not changed by later schedule edits.
- The weekly schedule remains the single source of truth for future days. The product does not require a separately persisted copy of every future day's schedule.
- The deadline for completing normal-practice feedback is the end of the last study interval on the originating study day, not midnight.
- An OFF day has no intervals and permits no activity. It does not create an alternate carryover window for unfinished practice feedback.

### 16.3 Attempt timing and analytics data sufficiency

- Store session-level start/end timing and each question's duration/order.
- A separate exact wall-clock timestamp for every question attempt is not currently required for the planned analytics or future revision decisions. Session date/time plus question order and duration are sufficient for the discussed needs, including last-practiced date and time-trend analytics.
- Do not add per-question timestamp fields speculatively. Revisit only if a concrete future feature requires distinguishing exact within-session attempt times (for example, independently timestamped repeated attempts).

### 16.4 Session-type boundaries remain explicit

- These decisions above apply to **normal question practice** only.
- Question revision remains a separate workflow and cannot be paused/resumed; its early-end and zero-duration rules remain as specified in Section 3.2.
- Fact revision remains a separate workflow and can be paused/resumed across study intervals; its unfinished-session end-of-day behavior remains as specified in Section 3.3.
- Do not generalize normal-practice recovery, feedback expiry, or timing rules to either revision workflow without a separate product decision.



### 16.5 Synchronization experience and recovery (decided 24 November 2026)

**One synchronization entry point**
- Replace the separate Home-screen Google Drive connection and Sync actions with one persistent **Sync status card**.
- The card always remains available, including when everything is up to date, and always opens the same dedicated Sync screen.
- Its concise state text reflects the current condition: **Sync pending**, **Syncing · N items**, **Sync needs attention**, or **All data synced** (wording may be refined during implementation).
- Other entry points, including a retry action from the session summary, must route to this same Sync screen and workflow rather than implementing separate retry/connection logic.

**Connection-first, automatic synchronization**
- The Sync screen detects whether Google Drive authorization is available and valid before presenting upload work as ready to proceed.
- If authorization is missing, expired, or revoked, show the required connect/reconnect step first. Do not present upload tasks as actively syncing while the required connection is unavailable.
- Once the connection is successfully established, begin eligible synchronization automatically. Do not require a separate **Start Sync** confirmation button.
- Connection and synchronization are distinct states and should be explained clearly to the user.

**What appears in the Sync screen**
- Prioritize unfinished work and items needing attention.
- Show session-level synchronization cards for practice sessions, with a clean, compact presentation: subject/session type, session date, one circular overall progress indicator, and a short current status.
- Do not show question counts, image counts, or technical sub-progress breakdowns on the main session card. A future card-detail screen may expose that information; its design is deliberately deferred.
- Independently created fact cards (not created as part of a session's feedback submission) appear as a separate synchronization item/group, distinct from session-level work.
- A fact card created and committed through session feedback belongs to that session's synchronization work; do not double-count it as an independently created fact-card item.
- Use one overall progress ring per session, not separate rings for database records, question images, and solution images. The status text can explain the current operation (for example, preparing, uploading images, waiting for connection, needs attention, or complete).
- Successfully synchronized items move into a separate **Completed** section that is collapsible. Keep this section accessible but visually secondary to pending/active/failed work.
- Tapping a session card may open a detailed synchronization view in a later iteration. Do not expand the current scope to design or implement that detail view now.

**Retry and connectivity behavior**
- Automatically retry temporary synchronization failures; do not require manual intervention for ordinary transient errors.
- If retries are exhausted or the failure requires user action, mark the item **Needs attention** and provide a retry path from the Sync screen.
- If internet connectivity is lost, safely pause affected uploads and show **Waiting for connection**.
- Resume automatically when connectivity returns.
- Preserve successful upload progress and already completed uploads so recovery does not unnecessarily upload the same content again.
- Keep locally committed application data and image blobs safe when Drive authorization, internet connectivity, or cloud synchronization is unavailable. A sync failure must not roll back or destroy locally committed work.

**Design direction**
- Use a clean, restrained visual hierarchy inspired by the supplied design references. Circular progress is a visual summary, not a substitute for clear textual status.
- Keep the Home entry point and Sync screen concise; put technical breakdowns behind a future detail interaction rather than crowding the primary workflow.
- These decisions define the intended product experience. They do not assert that the current implementation already supports token refresh/reconnection, durable upload retry, connectivity recovery, or accurate per-item progress; those capabilities must be verified and implemented as needed.


### 16.6 Google Drive authorization, account isolation, and a simpler experience (decided 24 November 2026)

**Product concern: Drive integration has become unnecessarily complex and opaque**

- The current experience exposes too many technical actions and states (for example, **Connect Google Drive**, **Reconnect Google Drive**, and separate sync actions) without making it clear what the user actually needs to do.
- This complexity has grown beyond the original purpose of Drive, which is simply to back up images reliably. The user should not have to understand OAuth tokens, authorization refresh, upload queues, or the distinction between connection and sync to use Measure.
- Treat this as a product and reliability problem, not merely a button-label problem. Simplify the underlying authorization lifecycle and the interface together.
- Do not ask the user to reconnect pre-emptively or merely because the app has opened. Ask for action only when a real pending operation requires Drive and the app has established that authorization is missing, expired, revoked, or otherwise unusable.

**One quiet, accurate Drive status; action only when necessary**

- Drive should normally operate in the background. Do not expose separate **Connect**, **Reconnect**, and **Sync now** controls as routine choices.
- Keep the overall synchronization entry point and Sync screen defined in Section 16.5. Drive authorization is a dependency handled by that workflow, not a second competing workflow.
- Determine and communicate the actual state accurately. At a minimum distinguish: no Drive work currently needs attention; Drive is ready; upload is waiting for internet; authorization is required; and a genuine Drive error needs attention.
- If there are no images waiting for backup, do not interrupt the user to authorize Drive.
- If images are waiting and authorization is already valid, upload without asking the user to reconnect.
- If authorization is absent, expired, revoked, or fails a real authorization check, explain the specific action needed and provide one connect/re-authorize action. Do not label a valid connection as needing reconnection.
- A page reload must not be treated as proof that Google authorization has been revoked. The implementation must deliberately restore or re-establish a usable authorization state, or report that authorization is unavailable; it must not infer revocation simply because an in-memory token is absent.
- Do not show upload work as actively syncing while Drive authorization is unavailable. Preserve the queued work and show a truthful waiting/attention state.

**Strict account isolation between Measure and Drive**

- Google sign-in to Measure and Google Drive file authorization are separate permissions, even when both use Google.
- Bind each Drive authorization to the authenticated Measure account and verify the Google identity associated with the Drive grant. Never assume that a token belongs to the current Measure user merely because a token exists.
- On Measure sign-out, clear the active in-memory Drive token and all account-specific Drive authorization state before another account can use the app.
- On Measure account change, invalidate the previous account's Drive session before loading or syncing data for the new account. Never upload one Measure user's photos to a different user's Drive.
- If the Drive identity does not match the signed-in Measure identity, block the upload and require the user to resolve the mismatch. Do not silently continue with the previously authorized Drive account.
- Provide an explicit **Disconnect Google Drive** action for a user who wants to disconnect it. Disconnecting must clear the app's active grant/token and stop queued uploads without deleting locally stored images or committed session data.
- Distinguish disconnecting Drive inside Measure (clearing the app's active authorization) from revoking Measure's permission in the Google Account security settings. Signing out of Measure is not, by itself, proof that Google's grant has been revoked.
- Preserve queued images and local committed data through sign-out, account switching, authorization expiry, and disconnection. Resume only after the correct Measure account has a valid matching Drive authorization.

**Required reliability behavior before further Drive testing**

- Missing or unusable Drive authorization must not block synchronization of independent session summaries or other records that do not depend on Drive images.
- Process cloud/session metadata independently from image uploads. Image-dependent cards and their dependent records may wait for their own image/parent dependencies, but unrelated session data must continue.
- A Drive authorization failure must be represented as a Drive-specific waiting/attention condition, not as a generic failure that makes all session synchronization appear broken.
- Account switching, sign-out, refresh/reload, token expiry, revoked consent, offline recovery, and reconnect must be tested. Include a two-Google-account test proving that photos from one Measure account cannot be uploaded to the other account's Drive.
- Do not ask the user to perform the Step A disconnected-Drive verification until the sync pipeline has been checked to ensure that a missing Drive token cannot abort independent session metadata sync.

**Current implementation gap observed during code review (24 November 2026; not a product decision or claim of completed work)**

- The current Drive token is held in module-level/in-memory state and is not restored as a usable token after a page reload. The UI can therefore show **Connect Google Drive** after reload even if Google still has a previously granted permission.
- The current account `signOut()` path signs out of Supabase but does not explicitly clear the Drive token. This creates a potential cross-account upload risk if another Measure account signs in in the same page lifetime.
- The current UI includes a **Reconnect Google Drive** label for its `connected` state, while an absent in-memory token after initialization leads to **Connect Google Drive**. The app does not yet provide a clear, verified distinction between valid authorization, missing in-memory token, expired authorization, and revoked Google consent.
- The current sync path was observed to process the upload queue before account-session synchronization. If upload processing throws because Drive authorization is unavailable, independent session metadata synchronization may be skipped. This must be verified and corrected before the disconnected-Drive test.
- These are findings from source inspection, not browser-verified reproduction results. Do not describe the account-mismatch upload as confirmed to have happened; it is a risk that must be closed and tested.



### 16.7 Sync experience implementation progress (24 November 2026)

- The first UI implementation adds one persistent Home sync-status card and a dedicated Sync screen.
- The Sync screen groups practice sessions separately from independently created fact cards. Fact cards created from an attempt/session are excluded from the independent group to avoid presenting the same work twice.
- Completed sessions and independent fact cards are placed in collapsible Completed sections.
- Google Drive photo backup is shown as a dependency within the Sync screen. When no photos are waiting, the UI explains that Drive authorization is not currently needed.
- The session ring currently communicates completion versus waiting only. It deliberately does not invent a percentage or imply measured sub-task progress. Real per-session progress and precise states (preparing, uploading, waiting for connection, needs attention) require sync-pipeline instrumentation and are a follow-up reliability step.
- This is a first implementation pass, not yet a verified end-to-end sync experience. Browser verification, accessibility/responsive review, and the underlying Drive/session pipeline fixes remain outstanding.


### 16.8 Sync pipeline and live progress (24 November 2026)

- Practice metadata sync is now attempted before Google Drive photo uploads. A missing or expired Drive token must not block session summaries and independent cloud records.
- When Drive authorization is already available in the current browser session, the app uploads queued photos and then runs a second metadata pass so newly created Drive IDs can be registered and photo-dependent cards can sync.
- Drive upload errors are isolated from the practice metadata sync. Photo blobs remain in the local queue for retry; the Sync screen distinguishes photo work from cloud metadata work.
- The Sync screen receives per-session and per-independent-fact-card syncing/completed callbacks from the cloud sync pipeline. Active items show an animated ring; completed items show a check.
- Photo queue progress reports processed items, failures, and the currently uploading photo. This is queue-item progress, not byte-level network progress; the UI must not describe it as a percentage of bytes transferred.
- Drive authorization is cleared on explicit Measure sign-out and when the authenticated Measure account changes, preventing an in-memory Drive token from being carried across account changes.
- Remaining verification: exercise successful and failed Drive uploads, expired authorization, photo-dependent card retry, account switching, offline recovery, and confirm session metadata still reaches Supabase when Drive is unavailable. No end-to-end browser test has yet been run for this implementation.


### 16.9 Two concentric synchronization rings (revised design decision, 24 November 2026)

This section supersedes the **one overall ring per session** visual rule in Section 16.5 and the interim ring descriptions in Sections 16.7–16.8.

- Each practice-session card uses **two concentric progress rings**, inspired by the Apple Fitness ring metaphor:
  - **Outer green ring — Supabase:** practice/session data stored in Measure's cloud backend (session summary, attempts, cards and their dependent records).
  - **Inner blue ring — Google Drive:** the session's associated image files.
- The rings communicate two independent backup responsibilities. A session may have its Supabase ring complete while its Drive ring is still partial or waiting.
- Do not add a ring per database table, card type, or individual image. The two categories are the complete top-level visual model.
- The Supabase ring is determinate only to the extent supported by real sync state. At minimum it moves from waiting to complete when the session's required Supabase records are confirmed synced. Do not show a fabricated intermediate percentage. Its arc should animate smoothly when its confirmed progress changes.
- The Drive ring is based on the actual number of images associated with that session that have completed Google Drive upload. Its arc represents uploaded images divided by the session's total associated images; update it as each upload succeeds. It is a file-count progress measure, not byte-level network progress.
- If a session has no associated images, the inner ring is visually muted/dashed and its state is **Not needed**. Do not represent no work as a completed 100% upload.
- Failed images retain the completed portion of the Drive ring and show a textual **Needs attention** state. Waiting for authorization or connectivity must not be represented as active uploading.
- The same two-category model applies to independently created fact-card items where applicable. A fact card without images has no Drive work; a fact card created through session feedback remains part of its originating session and must not be double-counted as an independent item.
- Keep a compact legend visible on the Sync screen: green = Supabase practice data; blue = Google Drive photos. Textual status remains necessary for accessibility and clarity; colour alone is insufficient.
- Animate arc changes with a restrained transition. Respect reduced-motion preferences. Do not use a perpetual spinner as a substitute for measured progress.
- The overall Sync summary may continue to communicate account-wide state, but per-session cards use the two distinct rings above.

Implementation note: session-to-image association is derived through attempts and cards created from those attempts. The Drive ring is calculated from locally persisted image upload records (status and remoteId); refresh it during upload progress and after sync data changes. Browser verification is required to confirm that this mapping covers every supported image-creation workflow.


### 16.10 Phase 1B completion, fact-card image lifecycle, and current project baseline (24 November 2026)

This section is the current handoff and supersedes the pre-merge branch instructions and test-data status in Section 15, as well as any earlier implementation-status statements that conflict with it.

#### Phase 1B product boundary and data behavior

- Phase 1B's normal-practice feedback, question/fact capture, question–fact linking, local persistence, and synchronization foundation has been merged into `main`.
- Normal-practice feedback remains draft-first and reversible until the student submits the complete session. Session-created question cards, session-created fact cards, attempts, and links are committed together in the final local transaction.
- A fact card created independently from the Cards/fact-bank workflow is a separate, immediately saved record. It is not a temporary session draft and must not depend on a practice session being submitted.
- Independent fact cards must be searchable and usable without a session. They can have their own image attachments and their own synchronization work.
- A fact card created as part of a session's feedback belongs to that session's synchronization work. Do not also list it as an independent fact-card sync item.
- Fact-card text/metadata and its photo backup are separate responsibilities. A text record should be able to synchronize to Supabase even when its photo is still queued, waiting for Drive authorization, offline, or retrying.
- Selecting or replacing a photo must preserve a local copy and a stable association with the intended card. Do not discard the local image or lose its reference because Drive is unavailable.
- Image upload must be queued for both independently created fact cards and session-created cards after their relevant local commit. Upload only images that are still referenced by the final saved card; replacing/removing an image must not leave an abandoned upload associated with the card.
- A successful photo upload must persist the remote Drive identifier/reference and update the corresponding local image/card metadata. A later pull/reload must preserve deferred or already-uploaded image references rather than replacing them with an empty image state.
- Retry must be safe and idempotent: previously completed uploads should not be needlessly duplicated, and failed/pending blobs must remain available locally.

#### Sync experience and architecture baseline

- Local IndexedDB/Dexie is the working copy and must preserve committed application records and image blobs.
- Supabase is the remote store for structured application records and relationships.
- Google Drive is the remote backup location for photo files; it is not a second application database.
- Sync metadata that does not depend on Drive must proceed independently of Drive authorization or photo-upload failures.
- The sync flow attempts application/session metadata synchronization, processes eligible Drive photo uploads when authorization is available, then performs a follow-up metadata pass where needed to register the resulting Drive references and unblock dependent records.
- A Drive failure must not make unrelated session metadata appear unsynchronized or cause local committed data to be rolled back.
- The Home screen has one persistent Sync status entry point leading to the dedicated Sync screen. Avoid separate routine Home actions for connecting Drive and starting sync.
- Drive authorization is requested only when pending image work actually requires it and the app has established that authorization is unavailable. Do not prompt when there are no images waiting, and do not treat a missing in-memory token after reload as proof that Google's grant was revoked.
- The Sync screen separates session work from independently created fact-card work. Session-created fact cards are not double-counted in the independent group.
- Session cards use two concentric rings: outer green for Supabase practice data and inner blue for Google Drive photos. The rings represent only these two top-level responsibilities.
- Supabase progress must be based on confirmed sync state; do not invent intermediate progress. Drive progress may use the count of associated images successfully uploaded divided by the total associated images. It is file-count progress, not byte-transfer progress.
- If no images are associated with an item, show Drive as **Not needed**, not as a completed 100% upload. Failed or waiting work must retain truthful text status; colour and animation alone are insufficient.
- Completed work belongs in a visually secondary, collapsible Completed section. Pending, active, and attention-needed work should remain the primary focus.
- The detailed per-session sync view remains future scope; do not expand the current work into that feature without a new product decision.

#### Recent implementation and testing observations

- The initial Phase 1B sync UI and pipeline changes were merged into `main`, including the unified Home sync entry point, dedicated Sync screen, separate independent fact-card sync grouping, completed sections, photo queue handling, deferred photo-reference preservation, and the two-ring visual model.
- The sync pipeline reports queue-item progress and failures. It must not describe this as byte-level transfer progress.
- A live test found that three previously created fact cards displayed **No photos**, while a newly created independent fact card subsequently worked. Treat this as evidence that the new independent-card path worked in that test, but that older affected records may already have lost or lack usable image references. Do not claim that the old photos can be recovered unless their local blobs or valid Drive references are found.
- When investigating older cards, distinguish a missing UI preview from a genuinely missing local blob or remote file. Verify the stored image metadata, local blob, remote Drive ID, and card association before deciding whether recovery is possible.
- The owner cleared the old Supabase test rows, manually deleted the old Google Drive photos folder, and cleared the local `jee-practice` IndexedDB database to start fresh. These were deliberate test-data cleanup actions, not routine app behavior.
- The owner has since reported that the deployed app is available for continued practice. Treat this as user-reported deployment availability; do not infer that every sync edge case has passed end-to-end verification.

#### Repository and deployment baseline

- Repository: `rajprasad-ds/measure`.
- Phase 1B branch was merged into `main` through PR #1.
- Merge commit: `e1507c7db5f1e2b59db5383ca40495639578e3a2`.
- A subsequent TypeScript build-fix commit was made directly on `main`: `ead50b16e92ff05a6ea40b19d76fac2fb9d73383` (`fix: resolve Drive token and report failed upload progress`).
- That fix explicitly narrows the Drive token to a string before resolving the token promise and includes the required `failed` count in upload progress callbacks.
- The owner subsequently reported being able to continue practicing. Do not assume a particular Cloudflare build SHA or claim fresh browser/build verification unless separately checked.
- `main` is the current deployment baseline because Cloudflare Pages deploys from `main`. Do not give the old instruction to continue implementation on `phase-1b-cards` or to avoid merging into `main`; that instruction is obsolete.
- For future implementation, inspect the current `main` state first. Use a focused working branch and a pull request for substantial changes unless the owner explicitly asks for a different workflow.

#### Current Phase 1B acceptance criteria

Before treating the foundation as fully reliable, continue to verify with fresh, meaningful data:

1. Complete a new normal-practice session and confirm session, attempts, question cards, fact cards, and links are persisted correctly.
2. Confirm feedback navigation and outcome changes do not leave abandoned cards, stale links, or stale attempt references.
3. Create an independent fact card, reload, and confirm its text, image preview, local blob, and card association remain intact.
4. Create an independent fact card with an image while Drive is unavailable; confirm the card text is saved and syncable, the image remains locally queued, and the UI reports the correct waiting state.
5. Restore valid Drive authorization and confirm the queued image uploads, its remote reference is saved, and the image remains visible after reload and cloud pull.
6. Repeat the image lifecycle for a fact card created through session feedback, confirming it is counted under its session and not duplicated as independent work.
7. Confirm a session with no images reports Drive as **Not needed**.
8. Confirm Supabase session/metadata synchronization succeeds when Drive is unavailable or an image upload fails.
9. Confirm retry does not duplicate already uploaded images and that failures remain visible until genuinely resolved.
10. Test sign-out, account switching, reload, authorization expiry/revocation, and offline recovery. Verify that one Measure account's images can never be uploaded to another account's Drive.
11. Check the two concentric rings against actual persisted sync state, including partial image completion, failed images, no-image sessions, and completed work.
12. Continue to run automated tests and a production build for code changes, then verify the relevant flows in the browser. A successful build alone is not end-to-end proof.

#### Product scope discipline

- Phase 1B is the current reliability baseline; the next design discussion should use the owner's prepared mockup rather than inventing a new visual direction in advance.
- Review the mockup against the established product rules, identify only genuine ambiguities or conflicts, and settle those before implementation.
- Do not start the adaptive revision planner, new scheduling algorithms, or unrelated feature expansion merely because the underlying card data has scheduling fields. Those remain separate product scope and require their own approved design.
- Preserve the core principles: one source of truth for study intervals; OFF days permit no study activity; honest metrics and sync states; local committed data is never destroyed by cloud failure; low-friction UX; and no unnecessary technical controls exposed to the student.


---

## 17. Current reliability handoff: image editor and account-safe Google Drive backup (24 November 2026)

This section records the active problems being investigated and the expected product behavior. It deliberately excludes Google OAuth access-blocked / origin-mismatch troubleshooting; that is a separate configuration issue and must not be conflated with the application-level image and account-isolation requirements below.

### 17.1 Pre-save image editor for fact-card photos

**Problem being addressed**

The current photo capture/selection flow needs a proper editing step before an image is committed to a fact card. A student may take a photo or select an existing image, but the raw image should not be saved immediately if it needs framing or orientation correction.

**Required experience**

- Both taking a new photo and selecting an existing photo should open the same pre-save image editor.
- The editor is part of the image-selection flow and appears before the user saves/commits the fact card.
- The student should be able to:
  - Rotate the image.
  - Crop the image.
  - Zoom in and out.
  - Reposition the image horizontally and vertically within the crop.
- The editing controls should make the result understandable and predictable. Avoid exposing technical image-processing concepts.
- The user should be able to review the final crop before confirming it.
- Cancelling the editor must not replace or corrupt an already saved image on the card.
- Replacing an existing photo should only replace the card's image after the edited result is confirmed and the card save flow succeeds.

**Image output and persistence constraints**

- The editor should render the final composition to a JPEG Blob using a canvas-based export.
- Preserve the existing local-first image lifecycle: save the resulting Blob locally, associate it with the intended card, and queue it for Drive backup through the existing image-store path.
- Do not bypass or create a parallel upload mechanism for edited images.
- The saved card must reference the edited output, not the original unedited camera/file Blob.
- The image should remain available locally while Drive is disconnected, authorization is unavailable, the device is offline, or an upload fails.
- Drive upload should remain deferred/retryable and must not be a prerequisite for saving the card's text or local image.
- Replacing/removing an image must ensure the old image is no longer treated as an eligible upload for that card. Do not leave abandoned queued uploads or stale associations.
- Keep image metadata and the local Blob association stable across reloads and subsequent Supabase pulls.
- Avoid unnecessary quality loss or unexpectedly large files; use a sensible JPEG export quality and dimensions appropriate for readable study notes. Do not resize so aggressively that small text becomes illegible.

**Implementation / verification status**

- The pre-save editor work is part of the current `phase-1b-cards` branch.
- The branch implementation was described as supporting rotation, crop, zoom, and horizontal/vertical positioning, with canvas JPEG Blob output and reuse of the existing local save/Drive queue lifecycle.
- This is implementation status, not proof of complete browser verification. Verify both camera capture and file selection, all editor controls, cancel/confirm behavior, replacement of an existing image, reload persistence, and deferred Drive upload before calling the flow complete.

### 17.2 Measure-account isolation for local sessions and cards

**Observed problem**

A real practice session in Math — Vector Algebra, created while signed into one Measure account, appeared again after a server restart and was also visible after signing into a second Measure account. The owner explicitly confirmed that they had not selected any local-session import, Sync, or Sync now action before observing the cross-account visibility.

The underlying risk is that browser IndexedDB is shared by Measure accounts using the same browser profile. A record left locally from one account must not become visible to, or be uploaded as data for, another account merely because the active login changed. Server restart/reload must not cause stale in-memory data from a previous identity to reappear.

**Product requirements**

- Every signed-in account must see only records owned by that exact authenticated Supabase user ID.
- Local unassigned/legacy records must never be silently exposed to a signed-in account. They may only be brought into an account through an explicit, deliberate import/ownership flow with clear user intent.
- Anonymous/unassigned local data, where legacy compatibility still exists, may be shown only in an anonymous context—not as fallback data for a signed-in user.
- On sign-in, sign-out, or account change, clear account-scoped in-memory session, card, attempt, link, and review state immediately before loading data for the new identity.
- Do not render cached records from the previous account while the new account's authentication or data load is still resolving.
- All asynchronous account-scoped loads must be protected against stale completion. If an earlier account's query finishes after an auth transition, its result must not overwrite the current account's state.
- Re-fetch account-scoped data after authentication transitions, including a fresh SIGNED_IN event for the same account where a refresh is required.
- Apply the same strict ownership rule consistently to History, Cards, session lists, and all other account-owned surfaces. Do not use permissive filters that include records with missing owner IDs for signed-in users.
- Do not silently delete, reassign, or upload a questionable legacy record. If ownership is ambiguous, preserve it safely and require an explicit resolution path rather than guessing.

**Implementation changes already made on `phase-1b-cards`**

The branch contains three focused commits addressing the observed class of bug:

1. `f88bc6034c513ca2c28257bc761b638af3a2ac8c` — `fix: isolate local study data between accounts`
   - Clears in-memory session/card/link/attempt/review state on SIGNED_IN and SIGNED_OUT.
   - Clears Drive authorization state on those transitions.
   - Loads sessions only after auth loading resolves and applies strict owner filtering.
   - Signed-in users see records whose owner ID exactly matches their user ID; unassigned records are only eligible in anonymous mode.
2. `76921a0f36d694999c26d741c5af1cfbd907ff48` — `fix: refresh account-scoped data on auth transitions`
   - Ensures account-scoped data refreshes on authentication transitions, including same-account SIGNED_IN events.
   - Avoids treating USER_UPDATED as a sign-in/sign-out boundary.
3. `aca900b4aeb79738373b32ead23bc18f23f839f5` — `fix: prevent stale account data loads from crossing sessions`
   - Adds an account-data load generation guard.
   - Prevents a card-data request started under an earlier auth state from applying its results after a newer account transition.

**Important limitation:** These changes are defensive code fixes, not proof that the specific Vector Algebra record's ownership or origin has been diagnosed. The local IndexedDB contents were not inspected as part of this code review. If the record itself has an incorrect owner ID due to an earlier import or data-writing bug, strict filtering alone cannot determine the true owner. Do not delete or transfer it without inspecting its provenance and obtaining the owner's decision.

**Required verification**

- Sign in to Measure account A and verify that only A-owned sessions and cards appear.
- Sign out, then sign in to account B in the same browser profile. Verify that A's Vector Algebra session and A's cards do not appear in History, Cards, or any session list.
- Repeat after a full page reload and after a server restart/redeployment.
- Repeat the transition in the opposite direction (B to A).
- Verify that no import action, Sync action, or background refresh is required to trigger the isolation behavior.
- Verify that a pending asynchronous load from account A cannot populate the UI after account B becomes active.
- Verify same-account reauthentication refreshes current data without briefly showing stale records.
- If any cross-account record remains visible, stop before cleanup. Inspect its local owner ID, source, and cloud counterpart; do not bulk-assign unowned records or clear IndexedDB as a diagnostic shortcut.

### 17.3 Google Drive authorization must be bound to the active Measure account

This is a separate but related account-isolation requirement. Measure identity and Google Drive identity are different things: Supabase determines which Measure account owns the application data, while Google OAuth determines which Google Drive can receive the photo files.

**Failure mode to prevent**

A Drive access token acquired while one Measure account is active must not remain usable after signing out or switching to another Measure account. Otherwise, queued photos belonging to the newly active Measure account could be uploaded to the previously authorized Google account's Drive. Conversely, a previous account's pending image work must never be picked up and uploaded under the next account's Drive authorization.

**Required behavior**

- Treat the in-memory Drive access token as scoped to the Measure identity under which it was obtained.
- Clear the app's in-memory Drive token and associated authorization status/error state on both SIGNED_OUT and SIGNED_IN transitions, including account-to-account switching.
- Clearing the app's token is not the same as revoking the user's Google grant. Do not revoke the Google grant merely because the user signs out of Measure.
- A pending OAuth callback started under an earlier account/auth generation must not restore a token after the user has switched accounts or signed out.
- Before uploading a queued image, establish that the image belongs to the active Measure account and that the current Drive authorization was obtained for that same active Measure account.
- Do not infer that the Google account is correct merely because a token exists. If the app cannot establish the authorization-to-Measure-account association, block the upload and ask the user to authorize Drive in the current Measure account.
- Preserve local photo Blobs and queue entries during sign-out, account switching, token clearing, authorization failure, and reconnect. Do not discard pending backups.
- After switching accounts, ask for Drive authorization only if the active account has eligible pending image work. Do not prompt when there are no pending photos.
- A missing in-memory token after reload is not evidence that the Google grant has been revoked. Request authorization only when needed, and make the selected Google account explicit where the OAuth flow supports it.
- Drive upload failure must remain isolated from Supabase metadata/session synchronization.
- The account association must be checked at the point of queue selection and again before/at upload, not only when the UI initially renders.

**Implementation changes already made on `phase-1b-cards`**

- `fcfc7e232d5cfc673681a3dbce41b9c93808b4be` and `a8667c50a186934e9cd9704aad4ded5a7e679a59` add Drive authorization-generation protection. Clearing authorization increments the generation, and a delayed OAuth callback from an earlier generation is rejected instead of restoring a stale token.
- The app clears Drive authorization state on Supabase SIGNED_IN transitions.
- The later account-isolation work also clears Drive authorization state on SIGNED_OUT.
- These changes clear the app's active in-memory authorization; they do not revoke the Google account's grant.

**Remaining risk / audit item**

- The current sync progress refresh path was previously noted to load local attempts/questions/facts/images from IndexedDB without consistently scoping pending-photo counts to the active account. Audit every image queue selection, upload path, progress count, and retry path for owner scoping.
- Audit whether each local image/queue record carries an immutable Measure owner ID and whether the upload worker verifies it against the current authenticated user immediately before upload.
- Verify that Drive IDs and image metadata are stored against the correct card and Measure owner, and that cloud pull cannot attach another account's image reference.
- If the current data model cannot prove the Drive authorization's Measure-account association, prefer requiring a fresh authorization after each Measure account transition rather than reusing a token whose account association is unknown.

**Required two-account Drive test**

1. Sign in to Measure account A and create/save a fact card with a photo. Confirm the photo is locally queued.
2. Authorize Google Drive while A is active and verify the chosen Google account is the intended destination.
3. Sign out of A without deleting local photo data.
4. Sign in to Measure account B in the same browser profile.
5. Confirm A's card/session/photo queue is not shown as B's data and is not selected for B's upload.
6. If B has its own pending photo work, authorize the intended Drive account for B and verify only B-owned images upload there.
7. Sign out and back into A; verify A's pending photo remains available and can resume only under A's identity and intended Drive authorization.
8. Repeat with page reloads, delayed OAuth completion, offline/online transitions, and retry after upload failure.

### 17.4 Current branch and handoff status

- Active implementation branch: `phase-1b-cards`.
- The branch includes the photo-editor/topic-picker work, Drive token-generation guard, and account-scoped local data-loading fixes described above.
- The latest account-data race guard commit recorded at the time of this handoff is `aca900b4aeb79738373b32ead23bc18f23f839f5`.
- The production OAuth account chooser / origin configuration investigation is deliberately not specified here; it is separate from the crop/editor and account-isolation product requirements.
- Cross-account session visibility and two-account Drive upload safety still require explicit browser verification. Do not report either as fully resolved solely because the code changes have been committed.
- Before further changes, inspect the current branch and working tree/remote state rather than assuming this handoff SHA is still the branch head.


### 17.5 Pending Drive photo queue appears shared across Measure accounts (observed 24 November 2026)

**Observed behavior**

A controlled test using two separate new testing identities (T1 and T2) on the latest local development build showed that session records appeared separated between the accounts, but pending photo work did not:

1. While signed into T2, the owner created a practice session containing one question marked wrong.
2. Two photos were attached to that question: one question photo and one solution photo.
3. The app displayed that Google Drive needed to be connected. The owner did not connect Drive, so the two photos remained pending locally.
4. The owner signed out of T2 and signed into T1 in the same browser profile.
5. T1 displayed **“2 photos awaiting sync”**, even though those photos had been added while T2 was active.
6. The owner explicitly clarified that both photos were indeed shown as awaiting sync under T1; this was not a question or an unverified possibility.

In this same round of testing, newly created session records for T1 and T2 remained separated. This suggests the session-list/account filtering behavior and the pending-image queue/progress behavior have different account-isolation outcomes.

**What this proves—and what it does not**

- It proves that the pending-photo count/status shown to T1 included photo work created under T2, or otherwise included shared local pending work not scoped to T1.
- It strongly indicates that pending image queue visibility/progress is not adequately scoped to the active Measure account.
- It does **not yet prove** that T1 can or did upload T2's photos to T1's Google Drive. The owner did not authorize Drive or initiate an upload under T1 during this observation.
- It does not establish whether the queue records lack owner IDs, whether owner IDs are present but ignored by the count query, or whether a different shared queue aggregation path is responsible. This requires code and local data-model inspection.

**Required product behavior**

- A Measure account must see only pending photo work that belongs to that exact authenticated Supabase user ID.
- T1 must not see T2's pending photo count, photo previews, upload prompts, retry actions, or sync status.
- T1's sync worker must never select, upload, retry, register, or otherwise mutate T2's queued photos.
- The queue item must retain an immutable originating Measure owner ID and stable association to its session/card/image record.
- Scope the pending count, queue selection, upload execution, retries, failure state, and post-upload metadata registration by the active account—not merely the UI display.
- Re-check that the queued item's owner matches the currently authenticated Measure user at the point of queue selection and immediately before upload. If ownership is missing or ambiguous, preserve the local image safely and block cross-account upload; do not silently assign it to the active account.
- Signing out or switching accounts must not delete pending photos. When the originating account signs back in, its pending work should remain available to that account.
- No Drive authorization prompt should be shown to an account solely because another account has pending photos.

**Investigation and verification required**

1. Inspect the IndexedDB/Dexie schema and every image/queue record written by session feedback, independent fact-card creation, image replacement, and cloud pull. Determine whether each record stores an immutable Measure owner ID.
2. Trace all pending-photo count/progress queries and confirm they filter by exact active owner ID.
3. Trace every queue selection, upload, retry, and remote-reference registration path. Enforce ownership in the data-access/sync layer, not only in the UI.
4. Check whether the session/card association can be used to validate image ownership, and ensure it cannot accidentally inherit the currently active account when the image was created under another account.
5. Keep T2's two pending photos untouched during investigation. Do not connect Drive or start sync under T1 as a diagnostic test.
6. After a fix, repeat the exact T2-to-T1 test: T2 creates two pending photos without Drive authorization; T1 must show zero photos awaiting sync and must not prompt for Drive because of T2's queue; T2 must still see its two pending photos after switching back.
7. If safe, test upload under T2 and verify that only T2-owned images upload to the Drive destination authorized while T2 is active. Then switch to T1 and verify no T2 work is selected or altered.
8. Repeat with reloads, sign-out/sign-in, server restart, offline/online transitions, and retry after a simulated upload failure.

**Status**

This is a newly observed, unresolved account-isolation defect in the local pending-image queue/progress path. The session account-isolation test passed for the newly created T1/T2 sessions in this test, but the pending-photo isolation test failed. No code fix or successful cross-account upload-safety verification is claimed by this entry. Treat this as a blocker for considering two-account image backup reliable or merging the relevant work.


## 17.6 Account-scoped photo queue implementation (24 Nov 2026)

The cross-account pending-photo leak has now received a code-level fix on `phase-1b-cards`. The fix is intentionally conservative: it does not delete or reassign any existing photo blobs.

### Changes made
- Pending/failed/uploading photo queries require an explicit Measure owner ID and return only exact-owner rows.
- Queueing, retrying, marking uploading, marking failed, and marking uploaded all verify the same owner before mutating a photo row.
- App pending-photo counts and per-session/fact-card Drive progress now filter images and their related cards/attempts by the active account.
- Legacy ownerless images are no longer automatically assigned to whichever account happens to sync. Bulk local-session import also leaves image ownership unchanged.
- A Measure account ID is bound to each in-memory Drive authorization. Uploads require the Drive token to match the owner of the photo queue. If the account changes while a queue is running, the next upload cannot use the newly connected account's token for the previous account's photos.
- Ownerless legacy photos remain on-device and unresolved rather than being silently uploaded. This preserves data while avoiding unsafe ownership guesses.

### Commits
- `6f0c1e9` — scope image queue operations to account owner
- `3da540a` / `39ff09a` / `986eab7` — scope counts/progress and stop automatic ownership assignment
- `0c57cfc` / `f4c5152` / `08c2bbb` / `61d8c9b` / `613377d` — bind Drive authorization to Measure account and remove remaining legacy image auto-claim

### Verification still required
This is a code-level correction, not yet a confirmed end-to-end pass. Retest with two fresh test accounts and separate sessions:
1. T2 creates a session with two photos while Drive is not connected.
2. Sign out of T2 and sign in to T1. T1 must show zero pending photos from T2, and T1's photo progress must not include T2's attachments.
3. Sign out of T1 and return to T2. T2 must still show its two pending photos.
4. Connect Drive only while signed in as T2. Only T2's two photos should upload and become associated with T2's records.
5. Repeat the account switch while a queue is active if possible; a T2 queue must never use a Drive token authorized for T1.

No automated workflow/status checks were reported for these commits at the time of this update. Do not merge or treat the fix as production-verified until the manual two-account test passes.

## 17.7 Independent fact-card creation save failure (24 Nov 2026)

An independent fact-card creation attempt exposed a save-flow bug on `phase-1b-cards`: the card record was committed to IndexedDB, then the image queue call used the old one-argument signature. The queue now requires the Measure owner ID, so the post-save queue step threw after the card had already been created. Because the creator's error was not rendered in its create-mode screen, the user could click Save repeatedly and create duplicate fact-card records while seeing no visible result. The sync list also labelled image-only cards "Untitled fact".

### Changes made
- Independent and linked fact-card creation now pass the card's exact `ownerUserId` to `queueImagesForUpload`; local-only cards do not attempt account-scoped Drive queueing.
- Editing a fact card queues its images only under the card's existing owner ID.
- The fact-card wizard uses a synchronous ref guard in addition to the disabled button to prevent rapid repeated submissions.
- The "Skip linking and save" action now explicitly skips the selected question instead of relying on asynchronous state updates.
- Save errors are displayed on the independent creation screen, and stale errors are cleared when a new save begins.
- Image-only fact cards receive a meaningful "Photo fact card" label in the Sync screen.

### Verification
Code changes are committed to `phase-1b-cards`. Manual verification is still required: create one independent image-based fact card, confirm exactly one card appears, verify its photos are queued under the signed-in account, and confirm a failed save displays a visible error without creating repeated cards. Existing duplicate records are not automatically deleted by this fix.


## 17.8 Mobile crop editor redesign (25 Nov 2026)

The earlier crop editor relied on a zoomed canvas with direct drag and pinch gestures. Mobile testing reported that pinch/zoom did not work reliably and that the interaction did not provide a proper crop box. The approved direction is a crop-box-first editor.

### Intended interaction
- Show a visible crop rectangle with eight touch handles (four corners and four edges), a rule-of-thirds grid, and dimmed content outside the selection.
- Drag the photo to reposition it underneath the crop frame.
- Pinch to zoom around the midpoint between the two fingers; retain a visible zoom slider as a non-gesture alternative.
- Provide Free, Original, 1:1, 4:3, and 16:9 crop presets.
- Keep rotate, reset, cancel, and use-photo actions accessible on mobile.
- Use one shared crop transform for preview and JPEG export so the saved photo matches the crop shown.
- Keep the editor full-screen on narrow mobile viewports and prevent browser touch scrolling while manipulating the image.

### Implementation status
- A dedicated `CropEditor` component has been introduced on the `mobile-crop-editor` branch and integrated into `ImageInput`.
- The component uses Pointer Events for drag/pinch, explicit crop handles, aspect presets, and canvas-based JPEG export.
- This is an initial implementation and has **not yet been build-verified or tested on a physical mobile device**. In particular, verify touch pointer capture, handle resizing, pinch midpoint behavior, rotated images, and pixel-accurate export before considering it complete.
- Do not merge to `main` until the user has tested it on mobile and approved the result.


## 17.9 Study Interval feature — research findings and implementation handoff (25 November 2026)

### Current product understanding

The Study Interval feature is the next focused Phase 1 feature. Its purpose is to represent the student's available study time as a recurring weekly schedule. It is a study-availability system, not a revision timetable and not a revision-session generator.

The following product behaviour is already established in Section 5 and remains authoritative:

- Each weekday is either **OFF** or has one or more study intervals.
- OFF days have no intervals; study activity must not be started and no study time may be recorded on those days.
- Intervals represent all study availability, including normal question practice and future revision activities. They are not reserved exclusively for Measure-generated revision.
- The weekly schedule is the source of truth.
- The schedule applicable to a calendar day is established at the start of that day and remains fixed for the rest of that day. Editing the recurring weekly schedule during the day affects the next calendar day, not the current one.
- Past days and their actual activity records must never be rewritten by later schedule edits.
- The application identifies intervals as passed, active, or upcoming.
- User-triggered plan refresh and revision-time allocation are separate later planning concerns; do not silently add them to this focused Study Interval feature.

Example of a weekday with multiple intervals: 08:00–12:00, 13:00–18:00, and 19:00–23:00.

### Findings from the initial technical review

The current product notes identify no existing weekly schedule model or Study Interval UI. The feature therefore needs a new settings/data model and time-aware application logic. This is a preliminary repository-level finding, not a substitute for inspecting the current `phase-1` source tree and Supabase migrations immediately before implementation.

The project uses React, TypeScript, Vite, Dexie/IndexedDB and Supabase. The expected implementation responsibilities are:

1. Persist the authenticated user's recurring weekly schedule in Supabase.
2. Enforce owner isolation with Supabase row-level security.
3. Provide a central schedule/domain service so Home, practice and other screens do not independently interpret intervals.
4. Resolve the applicable weekday schedule and derive passed/active/upcoming interval state using a consistent local-time policy.
5. Cache the current day's resolved schedule locally if required for offline use, while keeping Supabase as the authoritative source and avoiding unsafe stale-write overwrites.
6. Integrate study-activity eligibility without breaking the distinct lifecycle rules for normal practice, question revision and fact revision.

### Data-model direction — proposal, not yet approved

Do not create migrations until the current schema, existing user settings patterns, sync approach and mockups have been reviewed.

A reasonable starting design is a user-owned weekly schedule with one or more interval rows per weekday, or a user-owned schedule document with validated weekday/interval entries. Choose between relational rows and a structured document based on the repository's existing conventions and the need for atomic edits/querying. Store weekday and local wall-clock start/end times as schedule values; do not treat recurring local times as fixed UTC instants.

Schedule changes must preserve the agreed "today stays fixed; changes take effect tomorrow" rule. Investigate a versioned schedule/effective-date approach or an equivalent daily snapshot/resolution mechanism. Do not create permanent daily schedule copies without demonstrating that they are needed. The chosen implementation must also define what happens when a schedule is edited offline and later synced, and must not allow an old cached version to overwrite a newer cloud version silently.

All schedule records must be scoped to the exact authenticated Supabase user ID. RLS must prevent cross-account reads and writes. Saving a complete weekly configuration should be atomic so a partial save cannot leave an inconsistent schedule.

### Central logic direction — proposal

Keep schedule interpretation in a shared domain/service module rather than duplicating date/time calculations in components. The service should expose clear operations equivalent to:

- Resolve the schedule applicable to a given local calendar date.
- Find the current interval and classify intervals as passed, active or upcoming.
- Calculate remaining study availability for the day.
- Determine whether a new study activity may be started at a given time.

These are conceptual responsibilities, not prescribed function names or a commitment to a particular API. Use one documented timezone/day-boundary policy throughout the app. Verify browser/device timezone behaviour and midnight transitions before implementation; the product direction is local-calendar-day based, but authoritative timezone persistence and travel/timezone-change semantics still need a decision.

### Open product decisions — do not guess

The following were identified during the initial design discussion and must be resolved with the owner before implementation if they affect behaviour:

1. **Overnight intervals:** Initial recommendation is to require each interval to start and end within the same calendar day. Confirm with the owner.
2. **Overlapping intervals:** Initial recommendation is to reject overlaps and require valid start-before-end intervals. Confirm whether adjacent intervals are allowed (they should normally be).
3. **Activity crossing an interval boundary:** Decide whether an already-running practice/revision activity may continue past the interval end, or whether the boundary blocks/ends it. Do not infer this from the OFF-day rule.
4. **Timezone changes:** Confirm how schedules should behave if the device timezone changes, including travel and daylight-saving transitions where relevant. The schedule should use local wall-clock intent, but the authoritative timezone strategy is not yet settled.
5. **Day-start resolution and offline edits:** Confirm how the app establishes the day's fixed schedule after midnight when offline, and how later cloud reconciliation handles edits made on multiple devices.

### UI/design dependency

The owner has prepared design mockups and will provide them before implementation. The interval representation is expected to be understandable from the existing mockup; the configuration screen design is not yet settled.

- Wait for the owner's mockups before designing or implementing the configuration screen.
- Review the actual references against the product rules above. Do not invent a new visual direction or assume the configuration interaction.
- Ask only about genuine conflicts or missing behaviour after reviewing the mockups.
- Design for mobile compatibility as part of the feature, but do not start the wider application UI redesign as a prerequisite.
- Keep the configuration workflow low-friction and do not expose technical implementation details to the student.

### Future-agent implementation instructions

When continuing this task:

1. Start by confirming the active branch is `phase-1`, inspect its current HEAD and working tree, and fetch the latest `phase-1` source. Do not assume older branch names or handoff SHAs remain current.
2. Read this document's Sections 5, 16.10 and 17.9, plus the owner's supplied mockups. Section 5 is the authoritative product requirement; this section records the implementation handoff and unresolved decisions.
3. Inspect the current Supabase migrations/schema, RLS policies, user settings patterns, Dexie schema and app sync architecture before proposing or writing a migration. Determine whether any schedule-related tables or partial implementation have appeared since this note.
4. Trace how the app currently determines the user's date/time, handles midnight, stores local preferences and gates session starts. Reuse existing conventions where sound.
5. Review the mockups first. Confirm only the open decisions that materially affect correctness; do not broaden the work into revision allocation, adaptive scheduling, analytics, or the full UI redesign.
6. Implement the recurring schedule, secure persistence, local/offline handling and shared interval interpretation as one focused feature. Keep the current-day schedule stable after a schedule edit, and preserve historical activity.
7. Ensure OFF-day and interval eligibility checks are applied consistently to all relevant study-start paths. Do not break normal-practice interruption/feedback rules or the separate question/fact revision lifecycles.
8. Add automated tests for weekday mapping, OFF days, multiple intervals, interval boundaries, overlap/invalid-time validation, schedule version/effective-date behaviour, timezone/day rollover, owner isolation and offline reconciliation. Add UI tests for configuration and mobile layouts where the current test setup supports them.
9. Run the repository's test suite, TypeScript check and production build. Report exact results; do not claim end-to-end correctness from a build alone.
10. Test in the browser, including mobile-sized layouts, schedule edits during the day, reload/offline behaviour, account switching and the next-midnight transition. Verify that a second account cannot read or alter the first account's schedule.
11. Keep the change on `phase-1`. Do not merge into `main` or deploy without the owner's explicit approval. Update this document with actual schema, migration, implementation, test and verification results after the feature is completed.

### Scope boundary and Phase 1 status

Study Interval configuration and interpretation are the remaining focused feature identified before the wider UI redesign. The wider UI redesign and mobile compatibility remain pending. Final regression testing and production verification are also required before declaring Phase 1 complete.

Do not treat the following as part of this Study Interval implementation unless separately approved: revision allocation percentages, question/fact time splitting, automatic daily revision-plan generation, adaptive question/fact selection, or analytics expansion.

No Supabase migration, backend implementation, UI implementation or test completion is claimed by this research note. This section records the current understanding, proposed technical direction and handoff instructions only.


### Step 2 implementation status — recurring schedule persistence

**Implemented on `phase-1` (25 November 2026):**
- Dexie schema v10 adds `weeklySchedules` and `studyDaySnapshots`.
- Weekly schedules are keyed by the authenticated user ID and stored locally first with a pending/synced state.
- Each daily snapshot is keyed by account ID plus local calendar date. The first snapshot captured for a date is immutable; later recurring-schedule edits do not rewrite it.
- Snapshot records preserve the weekday's OFF flag, intervals, capture timestamp and device timezone identifier.
- The Supabase migration `20261125120000_weekly_study_schedules.sql` creates one recurring schedule row per authenticated account, with select/insert/update/delete RLS policies.
- Account sync reconciles the local schedule with the cloud row. The newer timestamp wins; failed network/schema operations leave the local copy available for retry.
- README setup instructions now include the migration.

**Scope/verification notes:**
- The schedule editor and Home timeline are not yet connected to these records.
- No practice-start gating or session cutoff is implemented by this persistence step.
- Daily snapshots are device-local. A second device captures its own daily snapshot from the account's recurring schedule when it first resolves that date.
- Timezone changes during a day and multi-device simultaneous edits are not fully serialized by a server-side compare-and-swap operation. The current reconciliation uses timestamps; this is a known limitation to address before claiming conflict-proof multi-device editing.
- Automated tests cover schedule shape, OFF-day consistency, required intervals and overlap validation. Dexie migration/reload behavior and Supabase RLS must still be verified in the local app and Supabase project.
- No Supabase migration has been applied to the live project from this repository change. The owner must run the new SQL migration in Supabase SQL Editor before cloud schedule sync can work.


## Step 3 — weekly schedule editor and Home timeline

Implemented on `phase-1`:

- Added `StudyIntervalPanel` to the signed-in Home screen, above the backup status card.
- Added a weekly editor for Monday–Sunday, with OFF days, multiple same-day intervals, 24-hour time inputs, and add/remove controls.
- Schedule validation is enforced by the repository before local persistence: valid times, end after start, unique interval IDs, and no overlaps. Adjacent intervals remain valid.
- Saving writes to IndexedDB first and then starts best-effort Supabase schedule sync. The panel also reconciles the account schedule when it loads.
- The Home timeline reads the immutable local-day snapshot. Editing the recurring schedule after the snapshot has been created does not rewrite today's intervals.
- Green timeline sections are positioned from the actual start/end timestamps of saved normal question-practice sessions. They are not cumulative fill; unused gaps remain visible between sessions.
- Only saved normal question-practice sessions are represented and counted. Question-revision sessions are excluded. Since session records are created by the existing feedback-save flow, an unsubmitted session does not appear as committed practice activity.
- The timeline refreshes its current-time marker every 30 seconds.

Not yet implemented in Step 3:

- Practice start is not yet blocked outside a scheduled interval.
- An active practice session is not yet automatically ended at an interval boundary.
- Feedback expiry/grace-period cleanup is not implemented.
- The Home panel currently requires a signed-in account, consistent with the current app's authenticated Home flow.
- Automated build/tests have not been run in this remote-edit workflow. Supabase migration and browser behavior still require local verification after the feature is complete.


## Step 4 — enforce Study Intervals for normal question practice

Implemented on `phase-1`:

- Starting a normal question-practice session now requires a signed-in account and a captured schedule snapshot for the current local day.
- A session can start only when the current timestamp falls inside one of today's scheduled intervals. OFF days and gaps between intervals are blocked with an explanation on the setup screen.
- The selected session duration is capped at the active interval's end. If the chosen duration would extend past the interval, the interval boundary wins.
- The existing active-session timer checks the capped `endsAt` and transitions the session into the existing feedback phase at that exact timestamp. The existing `finishSessionAt` logic closes a running question timer at that same boundary.
- Recovery re-reads the immutable snapshot for the session's original local date and re-applies the interval boundary before resuming. If a legacy/recovered normal-practice session did not start inside a valid interval, it is closed at its start rather than allowed to continue outside the schedule.
- Question-revision session behavior has not been changed. Fact revision is also untouched.
- Added unit coverage for the shared practice-session cutoff calculation.

Important scope boundary:

- This step does not yet implement a feedback grace period, pending-feedback expiry, or discard cleanup. Feedback remains available through the existing flow until Step 5 adds the configurable deadline.
- A user who has not configured a weekly schedule must configure one before starting normal practice.
- The app uses the device's local date/time and the previously captured local-day snapshot. Device clock tampering and cross-device snapshot serialization remain out of scope.
- Tests/build have not been executed in this remote-edit workflow; local browser testing and Supabase migration verification remain pending.


Step 4 follow-up correctness fix:

- The first Home visit of a local calendar day now captures an OFF snapshot even when no weekly schedule exists yet. Creating the first schedule later that day therefore does not retroactively open today's intervals; the schedule becomes active on the next local day. This preserves the "day is fixed once it starts" rule.


## Step 5 — normal-practice feedback deadline and expiry

Implemented on `phase-1`:

- Added an account-level feedback grace setting in the Study Interval editor: **2, 6 or 12 hours**. The default for existing/new schedules is **6 hours**.
- The selected grace period is copied into the immutable local daily schedule snapshot. Changing the recurring setting later does not change the deadline for a day whose snapshot already exists.
- For a normal question-practice session, the deadline is calculated from the end of that day's **final scheduled interval**, plus the captured grace period. It is not calculated from the end of the individual practice session or the first interval.
- The feedback screen displays the deadline. Feedback can be completed after study intervals close, but not after the deadline.
- Submission checks the deadline before preparing the save and again inside the same IndexedDB transaction that writes the session, attempts, question-card updates and links. A session receives `feedbackSubmittedAt` inside that transaction; the UI moves to the summary only after the transaction successfully resolves. Photo upload and cloud sync are post-commit work and do not determine whether feedback was submitted.
- The local submission timestamp is included in the cloud session metadata and synced separately from photo upload. The migration adds `sessions.feedback_submitted_at` and `weekly_study_schedules.feedback_grace_hours`.
- On recovery, the app resolves the original day's frozen snapshot and deadline. Expired pending feedback is discarded instead of being offered for resume. While the feedback screen is open, a local timer enforces expiry even when offline or after the scheduled intervals have ended.
- Expiry removes only the pending active-session snapshot. It does not delete independently saved fact cards or their images, and it does not create session, attempt, question-history or revision-planning records.
- The policy applies only to normal question practice. Question revision and fact revision lifecycle behavior remains unchanged.

### Verification status and limitations

- Added unit tests for deadline calculation from the final interval, 2/6/12-hour grace values, OFF days, and the inclusive deadline boundary. Tests and TypeScript/build checks have **not** been run in this remote GitHub editing workflow.
- The new Supabase migration has been committed but has **not** been applied to the live Supabase project. Apply it after the weekly schedule migration and before expecting the new grace setting or cloud submission timestamp to sync.
- Offline expiry is based on the device clock. Clock tampering remains out of scope.
- Expiry cleanup removes only draft image IDs found in the pending feedback snapshot when they are not referenced by any persisted question/fact card and their local image rows belong to the current account in a local, pending or failed state. It does not delete uploaded images, ambiguous/unowned images, or any independently saved fact-card image. This is targeted cleanup, not a global orphan-image sweep.
- Browser testing is still required for feedback recovery across reload, expiry while the app is closed, the deadline boundary, and a failed IndexedDB transaction. No CI result is claimed.
