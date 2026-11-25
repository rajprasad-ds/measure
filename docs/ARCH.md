# Engineering and state invariants

## Stack and boundaries
- React + TypeScript + Vite.
- Dexie / IndexedDB is the local persistence layer.
- Supabase/cloud sync is asynchronous backup, not the local commit boundary.
- Keep feature logic in its existing feature modules; avoid expanding `App.tsx` further where a focused component is practical.

## Data authority
- Persisted local records are the source for displayed progress.
- Weekly study schedule is the editable recurring source of truth.
- A per-user, per-local-day snapshot freezes the day's schedule and feedback grace period.
- Local-first session feedback transaction is the commit boundary. Cloud/photo sync follows independently.

## Study interval invariants
- Weekly schedule is by weekday: OFF or one or more same-day intervals.
- Intervals are at least 15 minutes, non-overlapping; adjacency is allowed; overnight intervals are not.
- Once a local day starts, its snapshot is immutable. Schedule edits apply from the next local day.
- If no schedule exists when a day is first observed, that day freezes as OFF. Saving a schedule later that day does not retroactively activate it.
- OFF prevents normal practice from starting and prevents study time being recorded.
- An active practice session ends at the exact interval boundary and proceeds to feedback.
- Feedback may be submitted outside the interval until the snapshot's final-interval end plus grace period.
- Expired unsubmitted attempts are discarded from session statistics/history/revision planning. Independently saved fact cards survive and are detached from discarded attempt provenance.

## Failure and race handling
- Local transaction success means the session is saved even if cloud sync fails.
- Sync/photo failures must be visible and retryable; they must not roll back local commits.
- Preserve account isolation when loading and syncing records.
- Re-check feedback expiry inside the local commit transaction.
- Do not rewrite past snapshots or historical activity when editing future schedules.
