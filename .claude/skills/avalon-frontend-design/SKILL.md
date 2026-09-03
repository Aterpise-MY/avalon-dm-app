---
name: avalon-frontend-design
description: The frontend design system for the Avalon DM APP — the C palette and its semantic color rules, the vellum/ink material switch, the Avatar/Btn/Rule primitives, mobile-first layout constraints, CJK typography, and the recipe for previewing the app at true phone width. Use before writing or reviewing any UI code in avalon-dm.jsx, styles.css, or the Vite entry points.
when_to_use: Any styling, layout, component, or visual-polish work on the Avalon DM APP. Trigger phrases include "restyle", "the UI looks off", "adjust spacing", "add a screen", "mobile layout", "dark theme", "调样式", "界面".
paths:
  - avalon-dm.jsx
  - main.jsx
  - styles.css
  - index.html
  - vite.config.js
---

# Avalon DM APP — frontend design system

This app is a host's companion for a live game of *The Resistance: Avalon*. One phone is
passed hand to hand around a table in a dim room. Every design decision below follows from
that: the host reads a screen in about two seconds, while talking, in low light.

## The context that overrides taste

- **Offline, single device, no accounts.** No network calls, no CDN fonts, no analytics.
  Player photos are captured on-device and never leave it.
- **Mobile-first, 390 × 844 is the baseline.** `viewport-fit=cover` is set in `index.html`;
  respect safe-area insets on notched phones.
- **All user-facing text is Chinese.** Keep it that way and match the existing terse,
  atmospheric tone. Check line-height against CJK glyphs, which are denser than Latin.
- **Glanceability beats elegance.** Contrast and tap-target size win every tie.

## Palette

Defined as `C` at the top of `avalon-dm.jsx`. Do not introduce a color outside it without
asking.

| Token | Hex | Role |
| --- | --- | --- |
| `ink` | `#10101E` | Page ground, and the `theme-color` meta |
| `ink2` | `#171730` | Header band |
| `panel` | `#1C1C38` | Cards, inputs, disabled buttons, avatar ground |
| `line` | `#2E2E52` | Borders and rules |
| `gold` | `#C8A24C` | Primary action, active selection, leader ring |
| `goldDim` | `#8A7038` | Section labels, dashed secondary affordances |
| `vellum` | `#E9E2D0` | The identity card ground |
| `vellumInk` | `#2A2418` | Text on vellum |
| `azure` | `#4C7BD9` | **Good** alignment |
| `crimson` | `#A8323A` | **Evil** alignment, wax seal |
| `text` | `#E4E2EE` | Body text |
| `dim` | `#8483A6` | Secondary text, unselected state |

### Color carries meaning — three rules

1. **Azure and crimson mean good and evil. Never decorative.** They are applied through the
   `sideColor(roleKey)` helper, which is the single source of truth. Use it rather than
   reaching for the hex. It drives the role name on the identity card, the night-phase
   avatar rings, and the deck chips.
2. **Gold means "you, the host, act here."** The primary CTA, the current leader's ring, the
   selected-for-mission ring, the active player-count button. Nothing else.
3. **Never let alignment color be the only signal for a state.** The host reads this in dim
   light at speed. Pair it with a text label — the vote row does this correctly with
   `赞成` / `反对` under each avatar.

## The material switch

The whole app is dark ink and gold **except the identity card, which is vellum cream**
(`C.vellum` ground, `C.vellumInk` text). Handing someone the phone and having the surface
itself change is a stronger "this is private, this is yours" signal than any label.

Preserve this. If you add another private, pass-the-phone moment, it belongs on vellum. If
you add a host-facing screen, it belongs on ink. Do not blur the two.

The wax seal (`火漆封信`) that gates each reveal is the same idea in miniature: a crimson
disc with a gold ring and a serif monogram. It is a ritual, not a button — keep it heavy.

## Typography

- `serif` (`Georgia, 'Times New Roman', serif`) — anything atmospheric or spoken aloud:
  screen titles, night-script lines, role names, section labels, avatar initials.
- `mono` (`ui-monospace, 'SF Mono', Menlo, monospace`) — numbers and round labels: the
  player-count buttons, round track, `第N轮`.
- Section labels use `serif` at 12px with `letterSpacing: "0.28em"` — that wide tracking is
  a signature of the design, applied by the `Rule` component. Don't hand-roll it.

## Component primitives

Reuse these three rather than restyling from scratch. They live near the top of
`avalon-dm.jsx`.

- **`Avatar({ p, size, ring, dim })`** — circular, falls back to the name's first character
  in serif when there is no photo. `ring` takes a color (use `sideColor()` or `C.gold`);
  `dim` drops opacity to 0.55 for the unselected state. Has a `.18s` transition.
- **`Btn({ children, onClick, disabled, tone, full, small })`** — `tone="gold"` is the
  primary; anything else renders as an outlined ghost button. Disabled falls back to
  `C.panel` on `C.dim`. Has `active:scale-95`.
- **`Rule({ label })`** — the gold-dim section divider with tracked-out label.

### CTA labels carry state

This is a deliberate pattern worth extending. The primary button says where you are and
does the arithmetic for the host: `还有人没填名字` → `名单齐了，配角色` → `2/2 人 · 开始投票`
→ `3 比 2 通过`. A new flow should do the same rather than saying "Continue".

## Styling is a deliberate hybrid

Roughly 65 Tailwind v4 utility `className` strings handle layout — flex, gap, rounded,
sizing. Everything with a color, a font, or an exact pixel value goes in an inline `style`
object referencing `C`, `serif`, or `mono`.

Match whichever the surrounding code uses. Do not convert one to the other, and do not add
a Tailwind config to re-declare the palette — `C` is the source of truth and it is consumed
by JavaScript (`sideColor`) as well as by markup.

Tailwind arrives through `@tailwindcss/vite`; `styles.css` is just `@import "tailwindcss"`
plus a full-height dark body.

## Layout rules settled in the refine pass

These are now enforced in code. Keep them.

- **The shell is one centred column, `SHELL_W` (480px) wide.** `Shell` renders a full-bleed
  `C.ink` ground with the column centred inside it, so the app never stretches across a
  desktop window. On screens wider than 520px, `.shell-col` in `styles.css` draws 1px side
  borders to frame the column; below that the column fills the viewport and the borders are
  suppressed. The DM-peek overlay is constrained to the same width.
- **`Shell` takes a `center` prop** that vertically centres the content area. Use it on any
  screen whose content is shorter than the viewport — currently the pass/identity screen and
  the night script. Without it a short screen strands its content at the top with several
  hundred pixels of dead space above the CTA. Do not use it on screens that scroll.
- **Safe-area insets are handled in `Shell`**, not per screen: the header uses
  `max(24px, env(safe-area-inset-top))` and the footer `max(16px, env(safe-area-inset-bottom))`.
  Height is `100dvh`, not `100vh`, so mobile browser chrome does not clip the footer.
- **The player-count row is `grid grid-cols-6`.** It was a fixed 52px width in a wrapping
  flex row, which overflowed 390px by two pixels and orphaned the `10` onto a second line.
  Do not reintroduce a fixed width there.
- **Unselected avatars sit at `opacity: 0.55`,** not 0.4. Below roughly 0.5 they stop being
  readable in a dim room, which is the only room this app is used in.
- **Text inputs get a gold border on focus** via `onFocus`/`onBlur`. They previously had
  `outline: none` with no replacement, so a tapped field gave no feedback at all.

## Verifying a change

Tests do not catch visual regressions here, and this app is used live — a broken night
script ruins a real game session. Always look at the running app.

```bash
npm run dev     # Vite, server.host is true so a phone on the LAN can open it
npm run build   # must pass before handoff
```

**The browser window resize tool silently no-ops in this environment** — it reports success
and the window stays at its original size. To see true phone width, serve a temporary
harness from the Vite root and screenshot that, then delete it:

```html
<!-- __preview.html at the project root, served at /__preview.html -->
<!doctype html>
<html><head><meta charset="utf-8"><title>preview</title>
<style>
  body{margin:0;background:#0a0a12;padding:24px;font:12px system-ui;color:#8483A6}
  .phone{width:390px;height:844px;border:1px solid #2E2E52;border-radius:12px;overflow:hidden}
  iframe{width:390px;height:844px;border:0;display:block}
</style></head>
<body><div class="phone"><iframe src="/"></iframe></div></body></html>
```

Clicks and scrolls land inside the iframe normally, so the whole flow is walkable at 390px.
Remove `__preview.html` when finished — it is a scratch file, not part of the app.

One automation caveat: typing Chinese through browser automation drops all but the first
character of each string (阿明 becomes 阿). That is the harness, not the app. Names in
screenshots will look truncated; don't file it as a bug.

## Out of scope for design work

The rule tables (`SPLIT`, `TEAM`, `failsNeeded`, `ROLES`) and the night-visibility and
win-condition logic belong to the `game-rules` specialist. If a visual fix needs to touch
them, stop and hand off.
