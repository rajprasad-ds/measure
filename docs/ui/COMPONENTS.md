# Component and state matrix

All interactive components must consider: default, hover, active, focus-visible, disabled, loading, empty, error. Mark inapplicable states N/A.

## Home utility bar
- One compact top row integrates sync state, signed-in email + sign-out action, and today's study interval status.
- Use compact icon/status clusters and truncation; do not stack separate large sync, account and schedule cards.
- Signed-in state: show email in small muted text and a clearly accessible Sign out action in the same utility region. Do not send the user to a large account panel just to sign out.
- Signed-out state: concise sign-in/backup affordance.
- Sync states: syncing, synced, pending/offline, error must remain distinguishable.
- Study interval: show today's frozen status and next available interval as space permits; tap opens schedule detail.
- Default/hover/active/focus-visible/disabled/loading/error states must remain legible at mobile width.

## Create Session (primary action)
- The strongest action and primary visual focal point on Home.
- Keep subject, chapter, duration and starting question grouped in one clear form.
- Account settings, sync detail and schedule editing must not visually interrupt or dominate this flow.
- Primary button must have clear enabled, disabled, loading and focus-visible states.

## Four surrounding metric tiles
- Two top tiles: average time/question and accuracy.
- Two lower tiles: only metrics with agreed semantics and trustworthy data. Syllabus coverage is currently excluded pending a completion definition.
- Same component geometry across all four: generous rounded corners, consistent thicker border, neutral default border, centered hierarchy.
- Headline is white; delta is compact and adjacent.
- Border and delta colour are derived from valid comparison only: positive/negative/neutral. Never assign a fixed colour by metric identity.
- Empty: `—`, no delta. Error: retain last valid local value where safe; otherwise show unavailable.
- Main central split numbers are larger and visually dominant compared with these four secondary tiles.

## Central progress split
- Two centered columns; large system-sans values; 1px × 90px gradient divider.
- Secondary labels and outcome breakdown sit beneath the headline without competing.
- States: empty/loading/error must not distort the central alignment.

## Account and sync detail
- Full account management belongs on the Sync/account destination or a deliberate detail view, not as a large block in the Home task flow.
- Home only exposes compact email/sign-out and sync status.
- Sign-out must call the actual sign-out handler; never render an inert shortcut.

## Bottom navigation
- Four destinations with recognizable icons and labels.
- Fixed/floating relative to the viewport, not the scrollable Home content.
- Must remain visible at initial page load and while scrolling.
- Must be outside any transformed/animated screen ancestor that could capture fixed positioning.
- Reserve content bottom inset so the nav does not obscure controls.
- Include safe-area inset and keyboard/focus handling.

## History panel
- Scrollable inset container, soft gradient separator and refined session cards.
- Empty/loading/error states remain inside the same container.
