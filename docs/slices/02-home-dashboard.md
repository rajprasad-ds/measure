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
- Remove redundant Today/date masthead; move compact sync/account utilities into the top area.
- Rebuild metric hierarchy and semantics from mockup-v4.
- Add syllabus coverage and current/highest streak only from grounded data.
- Use gradient vertical separators and a refined scrollable history container.
- Add icons to fixed floating bottom navigation.
- Clarify frozen OFF snapshot messaging.

## Likely files
- `src/App.tsx` or extracted Home dashboard component
- `src/design-system/app-shell.css`
- `src/features/navigation/MainNavigation.tsx`
- `src/features/study-interval/StudyIntervalPanel.tsx`
- Focused tests for any derived metric helpers

## Hard verification gates
- Existing study interval and session lifecycle tests remain green.
- TypeScript and production build pass.
- Verify at 375px, 768px and 1280px in a browser before claiming visual completion.
- Do not invent historical deltas, syllabus coverage or streak values.
