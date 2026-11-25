# Visual baseline: Measure

## Authority and aesthetic
- Primary reference: `docs/design/mockup-v4.html`.
- Copy its restrained, high-contrast dark dashboard, precise typography, compact information density, centered metric hierarchy, soft gradient separators, and floating icon navigation.
- It should feel like a deliberate study instrument, not a generic admin dashboard or a stack of generic cards.

## Palette roles
| Role | Value / rule |
|---|---|
| App background | `#141414` |
| Card surface | `#050505` to `#111111` by hierarchy |
| Lime accent | `#a3ff3c` for active/action states |
| Positive | green; use for favourable change, not every headline number |
| Negative | red; use for unfavourable change |
| Secondary | muted neutral grey |
| Divider | vertical and horizontal separators use a transparent-to-`#555`-to-transparent gradient, never a flat grey line |

## Typography
- Roboto/system sans stack.
- Main metric values are large, white, centered, tabular numerals; labels are smaller and muted.
- Change indicators are compact, adjacent to the metric, and carry a signed delta (e.g. `+2%`).
- Do not use coloured headline values to communicate the direction of change; colour the delta and relevant outline instead.
- Average time per question uses compact `m:ss` or `m:ss.d` formatting, never hour-formatted stopwatch output for ordinary per-question averages.

## Metric semantics
- Average time: large white value; signed delta beside it. Rising average time is red/negative; falling is green/positive.
- Accuracy: large white percentage; signed delta beside it. Rising is green/positive; falling is red/negative.
- Metric outline/border follows the same delta meaning. Neutral/unknown comparison uses neutral border and no invented delta.
- Syllabus coverage and streak are separate lower dashboard indicators, as shown in mockup. Only display grounded calculations; otherwise show an honest unavailable state.
- Main middle metrics are centered around their columns, not left anchored.

## Shape, spacing and borders
- Use rounded metric containers, but keep them visually light and proportionate; avoid oversized pill-like stat cards.
- The top two metrics should be balanced in width and height.
- Keep supporting labels close to values; avoid oversized padding that makes values float.
- Preserve clear separation between dashboard regions without boxing every element.

## Anti-patterns / avoid list
- No redundant `Today + date` masthead consuming prime vertical space.
- No huge hour-prefixed average time values.
- No green accuracy headline when green belongs to the positive delta.
- No coloured borders without a clear metric-change meaning.
- No left-aligned oversized totals in the central split.
- No solid grey divider where mockup uses a fade gradient.
- No history list presented as plain uncontained rows; use a scrollable inset panel and refined session cards.
- No text-only bottom nav; every item has a recognizable icon and label.
- No navigation that scrolls away with the page or sits after the last content block.

## Motion
- Control feedback: 150–210ms.
- Screen transitions: ~280ms.
- Sheets: ~300ms.
- Use transform/opacity for motion; respect `prefers-reduced-motion`.
