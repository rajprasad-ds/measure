# Slice 02 — Home dashboard refinement

## Context Load List
- `docs/SPEC.md`
- `docs/ARCH.md` (data and study-day snapshot invariants)
- `docs/ui/TOKENS_AND_TASTE.md`
- `docs/ui/COMPONENTS.md`
- `docs/ui/FLOWS_AND_LAYOUT.md`
- `docs/DECISIONS.md`
- Visual authority: `docs/design/mockup-v4.html`

## Scope
- Integrate sync, signed-in email/sign-out and today's study interval into one compact utility bar.
- Keep Create Session the dominant Home action; move full account management out of the central Home flow.
- Fix bottom navigation so it is viewport-fixed at initial load and while scrolling; place it outside transformed page containers.
- Rebuild metric hierarchy: four consistent rounded tiles around larger central progress figures.
- Use neutral borders by default; derive red/green only from valid metric deltas.
- Format average time as readable duration (`3.7s`, `1m 03s`).
- Remove syllabus coverage until a chapter-completion formula is agreed.
- Keep the history area scrollable, inset and visually refined.

## Non-goals
- Do not invent syllabus completion criteria.
- Do not change study interval snapshot behaviour.
- Do not add fake metric deltas or sample values.

## Likely files
- `src/App.tsx` or extracted Home dashboard component
- `src/design-system/app-shell.css`
- `src/features/navigation/MainNavigation.tsx`
- `src/features/study-interval/StudyIntervalPanel.tsx`
- Account summary component if extraction is appropriate

## Hard verification gates
- Existing study interval and session lifecycle tests remain green.
- TypeScript and production build pass.
- Verify at 375px, 768px and 1280px in a browser.
- Verify nav at initial scroll position and after long Home scrolling.
- Verify signed-in email and real sign-out action.
- No syllabus coverage percentage appears.
