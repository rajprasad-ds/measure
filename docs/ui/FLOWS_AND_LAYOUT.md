# Screen composition and choreography

## Home hierarchy (top to bottom)
1. **Single compact utility bar:** sync state + account email/sign-out + today's study interval representation. One coherent horizontal composition; wrap intelligently only on narrow screens.
2. **Progress overview:** two upper metric tiles (average time, accuracy), central split (questions practised, fact reviews), two lower supporting tiles only when their semantics are defined. Syllabus coverage is omitted pending a completion formula.
3. **Create Session:** primary focal point, visually stronger than utility/status/account elements. Avoid placing a large AccountPanel between dashboard and session creation.
4. **Today's history:** gradient separator, bounded scrollable container, refined session cards.
5. Other secondary information may follow without pushing the primary action below the fold unnecessarily.

## Utility bar composition
- Compact, low-height row/card; do not create three independent full-width cards for sync, account and schedule.
- Sync: small icon + concise status, opens Sync.
- Account: email at small size + Sign out action inline. Signed-out: sign-in affordance.
- Study interval: compact timeline/status indicator, opens schedule details.
- At 375px, allow two compact rows within the same visual utility group rather than clipping or forcing tiny text.
- Keep account/sync secondary; Create Session remains the primary action.

## Dashboard spatial rules
- Mobile-first content width around 430px.
- Top pair and lower pair use identical rounded tile geometry and consistent border thickness.
- All metric tiles neutral by default. Apply red/green only when a real comparison delta exists.
- Central split has two equal columns with centered values; main values larger than surrounding tile values.
- Divider: width 1px, height 90px, `linear-gradient(transparent, #555, transparent)`.
- Average time labels use readable durations such as `3.7s` and `1m 03s`, not stopwatch `0:03.7`.
- No syllabus coverage until a defensible completion formula is specified.

## Navigation and viewport
- Bottom navigation is fixed to the viewport and visible at initial load, during all Home scroll positions and on other primary pages.
- It must not be a child of a transformed/animated page container. Render at app-root level or through a portal outside such ancestors.
- Use safe-area bottom inset and matching content bottom padding.
- Never position navigation after the final Home content in document flow.
- Check for transformed ancestors, overflow clipping, stacking contexts and mobile viewport sizing when debugging fixed positioning.

## Responsive
- 375px: no horizontal overflow; utility bar wraps within its group; nav remains visible; Create Session is not buried.
- 768px: centered content with controlled max width.
- 1280px: deliberate wider layout; do not stretch phone cards across the screen.

## Interaction choreography
- Screen enter ~280ms; sheets ~300ms; controls 150–210ms.
- Animate opacity/transform only; avoid layout-thrashing.
- Keep focus visible after navigation and keyboard interactions.
- Honour reduced-motion preferences.
