# Product contract

## Core purpose
Measure supports timed question practice, feedback, question/fact-card creation and revision, history, and account/cloud backup.

## Primary flows
- Home: see today's study availability and progress; start a practice session; inspect today's history.
- Study schedule: configure weekly weekday intervals and feedback grace period.
- Practice: choose subject/chapter/duration/start question; work through timed questions; end at the allowed interval boundary.
- Feedback: record outcomes and causes; optionally create/edit question and fact cards; submit the session.
- Cards: review and manage question/fact cards.
- History: inspect committed sessions and outcomes.
- Sync/account: sign in, back up data and images, inspect sync state.

## Acceptance principles
- Saved data, not sample/mockup values, drives metrics.
- Empty states must be explicit; never imply a metric is zero when it is unknown.
- Home metrics distinguish current values from change indicators.
- UI changes must not alter session, feedback, revision, or sync semantics.
- Navigation remains available at the viewport bottom on every primary screen.
- The mobile mockup is the primary visual reference; desktop is a responsive adaptation.

## Non-goals for the current visual pass
- No new analytics model or fabricated historical comparisons.
- No changes to study interval policy, feedback expiry, or session commit semantics.
- No replacement of the existing persistence or sync architecture.
- No fake syllabus coverage or streak values when source data is insufficient.
