# Screen composition and choreography

## Home order
1. Compact top utility row: sync state and account access. Do not spend a full header row on redundant Today/date text.
2. Study interval timeline/status.
3. Dashboard metrics: top pair (average time, accuracy), central split (questions practiced, facts added), lower pair (syllabus coverage, streak).
4. Primary sync status card / account shortcut where it fits without duplication.
5. New practice session entry point.
6. Today's practice history in a bounded, scrollable container.

## Dashboard spatial rules
- Mobile-first; primary content width around 430px.
- Top pair: two equal columns.
- Central split: two equal columns with centered values and a vertical gradient separator.
- Vertical divider: width 1px; height 90px; `linear-gradient(transparent, #555, transparent)`.
- History: fixed max-height with internal scrolling; card-like rows and soft gradient separator above.
- No redundant Today + date title. Preserve enough top space for sync/account utilities.
- Account and sync should be compact, coherent, and near the top; avoid repeating full sync detail in multiple places.

## Navigation
- Fixed floating bottom bar across all primary screens, including Home.
- Four icon+label destinations.
- Use safe-area bottom inset and matching content bottom padding.
- Navigation must not be positioned after the last content in document flow.

## Responsive
- 375px: no horizontal overflow; metrics remain readable; nav labels fit.
- 768px: centered content with controlled max width.
- 1280px: use a deliberate wider layout where appropriate; do not simply stretch phone cards across the screen.

## Interaction choreography
- Screen enter ~280ms; sheets ~300ms; controls 150–210ms.
- Animate opacity/transform only; avoid layout-thrashing animation.
- Keep focus visible after navigation and keyboard interactions.
- Honour reduced-motion preferences.
