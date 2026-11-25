# Decisions and gotchas

## 2026-11-25 — Dashboard metric semantics
- Context: First Home pass coloured headline values and used oversized stopwatch formatting.
- Decision: Headline values stay white; compact signed comparison deltas carry positive/negative colour and matching border meaning. Default borders remain neutral.
- Why: Colour must communicate a measured change, not decorate a metric.

## 2026-11-25 — Frozen study-day OFF state
- Context: First use can create today's snapshot before a weekly schedule is saved.
- Decision: Explain that today's OFF state is frozen and schedule edits begin tomorrow; never silently rewrite today's snapshot.
- Why: Historical/day-snapshot invariants take precedence.

## 2026-11-25 — Dashboard hierarchy
- Context: Home used a redundant Today/date heading, flat divider, uncontained history and weak central metric hierarchy.
- Decision: Compact utilities, gradient dividers, centered central figures, bounded history and fixed icon navigation.
- Why: Match mockup-v4's hierarchy rather than copying only colours.

## 2026-11-25 — Syllabus coverage is undefined
- Context: Earlier Home code counted any chapter touched by a session as covered and presented a percentage.
- Decision: Do not display syllabus coverage until a real completion formula and supporting data model are agreed. A session touching a chapter is not completion.
- Why: Avoid misleading progress claims.

## 2026-11-25 — Fixed navigation and transformed ancestors
- Context: Bottom navigation appeared only after scrolling to the end of Home despite fixed-position styling.
- Decision: Keep the nav outside transformed/animated screen ancestors (or render it at app-root level via portal); test at initial and scrolled positions.
- Why: CSS transforms can establish containing blocks for fixed descendants.

## 2026-11-25 — Home utility and primary action
- Context: Separate sync, account and study schedule blocks plus a large account panel competed with Create Session.
- Decision: Combine sync, email/sign-out and today's interval into one compact utility region; keep Create Session visually dominant.
- Why: The user's primary task must own the visual hierarchy.

## 2026-11-25 — Documentation retrieval
- Context: Product, architecture and visual requirements were mixed in a large product-understanding document.
- Decision: Route builders through small single-concern docs and atomic execution slices.
- Why: Reduce irrelevant context and prevent visual rules being lost.
