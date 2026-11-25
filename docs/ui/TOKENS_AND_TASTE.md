# Visual baseline: Measure

## Authority and aesthetic
- Visual authority: `docs/design/mockup-v4.html`.
- Target: restrained, high-contrast study instrument; deliberate, editorial, compact, not a generic admin dashboard.
- Preserve the mockup's hierarchy, spacing, iconography, metric semantics and divider treatments, not just its palette.
- Prefer native-feeling typography: system stack `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif`; use Roboto only where the source mockup explicitly requires it. Do not use novelty/funky display fonts for metrics.
- SF fonts are not guaranteed on Windows/Android; fall back cleanly to system sans.

## Palette roles
| Role | Rule |
|---|---|
| App background | `#141414` |
| Card surface | `#050505`–`#111111` |
| Lime | `#a3ff3c`; active/action affordance only |
| Green | favourable measured change only |
| Red | unfavourable measured change only |
| Neutral | default border, labels, separators and unknown comparisons |
| Divider | gradient fade; never a flat solid grey rule |

**Colour is semantic, not decoration.** No green/red metric border or text unless a valid comparison/calculated state supplies that meaning. No permanently green/red stat cards. When comparison is unavailable, use neutral border and omit the delta.

## Typography and number formatting
- Headline metric values: large, white, centered, tabular numerals, confident weight.
- Labels: small, muted, closely associated with values.
- Change indicator: compact signed value beside headline, coloured only by meaning.
- Average time/question: readable human duration. Prefer `3.7s` for sub-minute averages; `1m 03s` for longer values. Avoid stopwatch-looking `0:03.7` and never show hours for ordinary per-question averages.
- Main central counts must be visibly larger than the four surrounding metric values. Use a serious system sans, not a novelty typeface.

## Metric semantics
- Average time: headline white; delta compares the same metric against yesterday. Higher average time is normally adverse (red); lower is favourable (green).
- Accuracy: headline white; delta compares against yesterday. Higher is favourable (green); lower is adverse (red).
- Delta and border meaning must be derived from a valid comparison. No comparison -> no delta and neutral border.
- Syllabus coverage is **not currently defined**. A session touching a chapter does not mean that chapter is complete. Do not display a percentage or infer completion from session presence. Keep the metric out of the UI until a defensible completion formula and data contract are agreed.
- Streak may be displayed only with an explicitly documented definition of an active day and consecutive-day handling.

## Shape, spacing and hierarchy
- All four surrounding stat tiles share one coherent rounded-rectangle system: same generous corner radius, consistent thicker border weight, padding and alignment.
- Default border is neutral. State colour may override it only when a valid comparison exists.
- Main central figures dominate; surrounding four tiles are clearly secondary and should not compete in size.
- Central split columns are centered, with a 1px × 90px vertical fade: `linear-gradient(transparent, #555, transparent)`.
- Lower supporting metrics must not look like unstyled text or orphaned KPIs; either use the same component system or omit until designed.

## Anti-patterns
- No redundant Today/date masthead.
- No giant account card or sign-out section interrupting the primary task.
- No text-only bottom navigation.
- No nav that participates in document flow or appears only after scrolling.
- No arbitrary colour, coloured headline values, or decorative status borders.
- No `0:03.7` stopwatch formatting for average time/question.
- No claim that a chapter is complete merely because it was practised.
- No central headline numbers that are similar in size to secondary stats.
- No account/sync/study schedule UI competing with the Create Session action.

## Motion
- Controls: 150–210ms; screen: ~280ms; sheets: ~300ms.
- Animate transform/opacity only; respect `prefers-reduced-motion`.
- A transformed/animated ancestor can change the containing block for descendants using `position: fixed`. Keep the bottom navigation outside transformed screen containers (or render it in a root-level portal) so it remains viewport-fixed throughout scrolling.
