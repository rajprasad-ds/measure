# Component and state matrix

All interactive components must implement and visually consider: default, hover, active, focus-visible, disabled, loading, empty, and error. States that do not apply should be explicitly marked N/A in implementation notes.

## Home metric pair
- Purpose: average time/question and accuracy with prior-day comparison.
- Default: large centered white value; muted label; compact signed delta.
- Hover/active: subtle surface response only; no exaggerated scale.
- Focus-visible: visible lime outline if interactive; otherwise N/A.
- Disabled/loading: N/A unless data is loading; use stable skeleton/placeholder.
- Empty: value `—`; no delta.
- Error: retain last valid local value if available; otherwise `—` and a concise error.
- Border: red/green only when a valid comparison exists; neutral without one.

## Lower dashboard indicators
- Syllabus coverage: percentage plus signed delta only when calculable from syllabus-linked records.
- Streak: current consecutive active days and highest streak; no sample numbers.
- Empty: explicit no activity / not yet available.

## Study interval summary
- Default: show today's frozen snapshot, not the unsaved weekly editor state.
- Empty/unconfigured: explain that today's first-seen snapshot may be OFF and future schedule edits begin tomorrow.
- Active: show current interval and remaining time.
- Off: explicitly distinguish today's frozen OFF state from the weekly schedule configured for tomorrow.
- Error/loading: visible and non-destructive.

## Sync and account summaries
- Compact summary cards near the top of Home; tap opens the full screen.
- Loading, offline, pending, synced and error states must be distinct.
- Account identity and sign-in actions remain available without dominating the dashboard.

## Bottom navigation
- Four primary destinations: Home, Cards, History, Sync.
- Each has an icon and label; active item is visually distinct.
- Fixed/floating at viewport bottom with safe-area padding; content reserves enough bottom space.
- States: default, hover, active, focus-visible, disabled; loading/empty/error N/A.

## History panel
- Scrollable inset container with soft gradient divider above it.
- Session cards show chapter, subject, planned duration, active time, attempts, accuracy and average/question where available.
- Empty/loading/error states remain inside the same container.
