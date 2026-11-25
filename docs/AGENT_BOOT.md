# Agent boot

Read only the slices relevant to the task.

| Task | Required context |
|---|---|
| Product behaviour / acceptance | `SPEC.md` |
| Persistence, sync, lifecycle, data integrity | `ARCH.md` |
| Visual language / styling | `ui/TOKENS_AND_TASTE.md` |
| Reusable UI and interaction states | `ui/COMPONENTS.md` |
| Screen composition / navigation / motion | `ui/FLOWS_AND_LAYOUT.md` |
| Past decisions and traps | `DECISIONS.md` |
| Home dashboard | `slices/02-home-dashboard.md` |
| Practice journey | `slices/03-practice-journey.md` (create when scheduled) |

## Authority order
1. Existing product logic and persisted data contracts are authoritative for behaviour.
2. `docs/design/mockup-v4.html` is the visual authority.
3. UI specs in `docs/ui/` record extracted rules and approved user feedback.
4. A task slice defines the current scope and verification gate.

Never change `main` unless explicitly asked. Current redesign branch: `phase-1`.
Do not infer missing product behaviour from mockup sample data. Do not claim visual QA without browser testing.
