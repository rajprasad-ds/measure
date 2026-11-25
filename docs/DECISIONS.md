# Decisions and gotchas

## 2026-11-25 — Dashboard metric semantics
- Context: First Home implementation coloured headline values and used oversized stopwatch formatting.
- Decision: Headline values stay white; compact signed comparison deltas carry positive/negative colour and matching border meaning.
- Why: This follows mockup-v4 and prevents colour from being semantically ambiguous.

## 2026-11-25 — Frozen study-day OFF state
- Context: First use can create today's snapshot before a weekly schedule is saved.
- Decision: Explain that today's OFF state is frozen and schedule edits begin tomorrow; do not silently rewrite today's snapshot.
- Why: Historical/day-snapshot invariants take precedence over making the UI appear immediately active.

## 2026-11-25 — Dashboard hierarchy
- Context: Home used a redundant Today/date heading, a flat divider and uncontained history rows.
- Decision: Replace with compact top utilities, gradient dividers, centered metric columns, lower coverage/streak indicators, scrollable history and fixed icon navigation.
- Why: Match the composition and visual hierarchy of mockup-v4.

## 2026-11-25 — Documentation retrieval
- Context: Product, architecture and visual requirements were mixed in a large product-understanding document.
- Decision: Route builders through small single-concern docs and atomic execution slices.
- Why: Reduce irrelevant context and prevent visual rules being lost among business invariants.
