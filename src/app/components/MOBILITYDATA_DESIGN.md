# MobilityData Design System

Design language for MobilityData products, extracted from the mobilitydata.org
WordPress theme (`mobilitydata2`). Use this as the visual/content contract when
building or reviewing UI for MobilityData.

## Brand voice

- Institutional, plain, precise, unexcited. Explain what a standard *is* before
  saying why it matters. Never sells.
- "We" for MobilityData; "you" almost never — only in CTAs ("Become a member",
  "Get involved").
- Sentence case everywhere (headings, buttons, nav). No Title Case, no ALL-CAPS
  buttons. Uppercase is reserved for the giant background watermark text and
  timeline date labels.
- Nouns in navigation ("Standards", "Membership", "News"); verbs in buttons
  ("Become a member", "Register").
- Specific, not aspirational: name formats, versions, years ("GBFS 3.0 adds
  geofencing", "Founded 2019"). Technical identifiers in mono (`route_id`).
- Short declarative sentences, 2–3 sentence paragraphs, measure ≤34em.
- No emoji, no exclamation marks, no rhetorical questions (except FAQ headings),
  no "unlock/leverage/empower", no em-dash drama. Numerals with spelled-out
  units ("6 min read", "$25,000").

## Color

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#96a1ff` (periwinkle) | Logo, all headings, all line-work, icons |
| `--color-accent` / `--color-black` / `--color-contrast-higher` | `#170a2e` (aubergine ink) | Body copy, inverted surfaces (primary button, membership header) |
| `--color-bg` | `#f7f7f7` (off-white) | Page background |
| — | `#ffffff` | Card fill (lifts off the off-white page) |

- Headings are periwinkle; body text is ink — the inverse of the usual convention.
- Max two background colors per page: off-white and, rarely, ink.
- `data-theme="dark"` inverts contrast but keeps the same periwinkle — brand
  color never changes.
- No gradients anywhere. Warning/success/error exist but are essentially unused.

## The one big idea: 2px periwinkle line-work

Every circle, card frame, divider, nav underline, portrait border, and long
decorative diagonal SVG path is drawn with a single **2px stroke** in
`--color-primary`. `--lines-size: 2px` is the most important token in the
system. Hairlines drop to 1px only in tables, lists, and the timeline track.
Nothing is filled unless it has to be.

## Type

Two faces, strictly divided by role:

- **Mulish** (`--font-primary`; site loads it as "Muli", the pre-rename name —
  use Mulish) — weights 400 and 700 only. Headings: 700, periwinkle,
  `line-height: 1.2`. Body: 400, ink, `line-height: 1.4` (1.58 in articles).
- **IBM Plex Mono** (`--font-secondary`) — weight 400. Every label: nav items
  (0.875em), button text, eyebrows, category tags, role titles, step numbers,
  dates, code identifiers, the watermark. Small + functional = mono.

Modular scale, ratio 1.2, stepping to 1.25 at the `md` breakpoint (64rem),
where the base font size also jumps from 1em to 1.25em.

## Corners, cards, elevation

- Base radius `0.25em` (`--radius-sm` 0.125em, `--radius-md` 0.25em,
  `--radius-lg` 0.5em). Corners are a 4px hint, not a style — the only truly
  round shapes are circles.
- **Cards are defined by border, not shadow**: white/off-white fill, 2px
  periwinkle border, `--radius-md`, no shadow. The `Story` component is even
  more open — a rule on left + bottom only, rounded top-left corner,
  deliberately unclosed.
- Shadows appear in exactly four places: buttons, header dropdown, timeline
  cards, selected pagination pill. Structure comes from lines, not shadows.
  No inner shadows, no colored left-border accent cards.

## Interaction

- Primary button is ink, flips to periwinkle on hover, shadow *shrinks* on
  hover (it settles, doesn't lift). Subtle buttons don't change color on hover.
- Nav links grow a 2px underline that scales in from the left over 0.9s
  `cubic-bezier(0.19, 1, 0.22, 1)` — the brand's signature slow expo-out sweep.
- Social/icon buttons fill periwinkle and flip glyph to white on hover
  (socials also scale glyph 1.2× over 0.2s).
- Images drop to `opacity: 0.85` on hover.
- Press state: `translateY(2px)` on everything interactive — never scale or
  color change.
- Focus: 2px translucent ink ring, never the browser default outline.
- Scroll reveal: 50px rise + fade, staggered 100ms per card (0.6s).
- Timings collapse to two values: 0.3s ease for feedback, 0.9s expo-out for
  sweeps/reveals.

## Imagery

- Documentary transit reportage: real people in stations/streets, motion
  blur, natural daylight, warm-neutral grade. No duotone, no color overlay,
  no grain filter.
- Bordered rectangles (2px periwinkle) at 3:4 (portraits) or 4:3 (board), or
  circle-cropped inside circle modules. No hand-drawn illustration.
- Decorative element: long thin 2px periwinkle SVG lines bleeding past
  container edges, connecting sections. `pointer-events: none`.

## Layout

- Content container `--max-width-md` (64rem); full sections up to `--max-width-xl`.
  Measure caps ~34em.
- Header: 50px tall on mobile, 120px from `md` up; logo 157px → 257px. Sits in
  flow (hides on scroll-down via JS), not permanently fixed.
- Section vertical rhythm: `--space-xxl` (5.25×); `--space-xl` between blocks.
- Grids stagger deliberately (team cards offset −3em/0/+3em by column; circle
  rows step down 0.9×`--space-xxxl` each; timeline alternates sides). Avoid
  level, uniform rows.

## Iconography

- No icon font, no third-party icon set (no Lucide/Feather/Font Awesome) — all
  hand-authored inline SVG.
- Social glyphs: filled silhouettes, single path, `fill: currentColor`, 32×32
  viewBox (twitter, facebook, youtube, slack, linkedin, instagram, github).
- UI glyphs: 2px stroked outlines, `stroke: currentColor`,
  `stroke-linecap: square` (arrow-right, plus/minus accordion, chevrons,
  search magnifier). New glyphs should match this style.
- Icons sized in `em` so they track type size. Emoji are never icons.

## Logo

Wordmark with interlocking-M mark, solid `#96a1ff`, minimum width 154px.
Square mark alone also available. No dark-background lockup exists in source;
periwinkle-on-ink and periwinkle-on-off-white are both valid, off-white is the
default.

## Components

| Component | Notes |
|---|---|
| Button | Primary (ink→periwinkle hover) and subtle variants |
| BadgeButton | Ring rotates 360°/20s linear infinite — the system's one continuous animation |
| IconLink | Circle link, fills periwinkle + white glyph on hover |
| SocialLinks / SocialGlyph | Filled-silhouette social icon set |
| TitleBackdrop | Giant uppercase watermark text, 7% opacity |
| BannerCard | Bordered card, image top (40% padding-bottom), no shadow |
| Story | Left+bottom rule only, open/unclosed frame |
| CircleText / CircleNumber / CircleRow | Circle-cropped imagery/text modules, staggered rows |
| PropTable / DefinitionList | Spec/definition display, 1px hairlines |
| TeamCard / BoardMember | Portrait cards, 3:4 / 4:3 bordered images, staggered grid |
| SiteHeader / SiteFooter / Pagination | Site chrome |
| Accordion | Plus icon animates to minus |
| MembershipCard | Ink header band + bordered body |
| VerticalTimeline | Alternating sides, date labels in mono with 0.1em tracking |
| SearchInput | Plain `.form-control` + primary button, no magnifier icon |

## Rules of thumb

- Never introduce a gradient, drop shadow beyond the four listed spots, or
  glassmorphism/blur — the framework has blur utilities but the brand doesn't
  use them.
- Never round a corner past `--radius-lg` outside of true circles.
- Never color a heading ink or body text periwinkle — the inversion is fixed.
- Never pull in an external icon set; draw missing glyphs as 2px-stroke
  square-cap outlines to match `arrow-right`.
- Keep to two type faces and their fixed roles (Mulish for prose, IBM Plex
  Mono for labels).
