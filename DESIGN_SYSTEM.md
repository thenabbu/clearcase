# DESIGN_SYSTEM.md

The official design reference for ClearCase. Future UI work must follow this file.

## 1. Project overview

- **Product name:** ClearCase — telemedicine photo triage
- **Surface profile:** **App / Product UI (§B3)** — a two-pane workspace, not a page.
- **Platform:** web, mobile-first (field phones), desktop = reviewing doctor
- **Target users:** rural health workers (capture) and reviewing doctors (board)
- **Main design goal:** a field instrument: one primary action per screen, board always
  visible, IMCI priority the only colour that speaks.

## 2. Brand direction

- **Visual style:** restrained ink-on-paper utility; no gradients, no glass, no hero.
- **Mood & tone:** calm, clinical-utility, institutional (field notebook + instrument).
- **Design personality:** brutalist-technical softened for health workers.
- **Design concept (one sentence):** *A field triage instrument — a two-pane workbench
  (case form | live board) in IBM Plex Sans + Mono where ink-on-paper restraint leaves the
  IMCI red/amber/green rail as the only saturated colour on screen* — landed in layout
  (asymmetric 1fr/440px panes), type (mono metadata: ids, times, counts, scores), colour
  (priority rails), motion (150 ms functional-only transitions).
- **Adversarial-review verdict:** cover "ClearCase" — the two-pane board with mono
  metadata and priority rails does not describe a generic health-SaaS competitor; the
  category-reflex test fails for healthcare teal/white (palette is warm paper + ink).
  One weakness found in review: the v1 wizard stepper + "Team Coffee Beans" footer read as
  hackathon PoC — both removed in this rebuild.
- **Reference style used:** radiology-queue dashboard (Fuselab) → priority-sorted rail
  rows; clinic triage inbox challenge (UICoach) → red-first board density; medical-device
  UI guidance (Nectar/Emergo) → colour-cue redundancy (colour + word, never colour alone);
  ODK Collect / CommCare field tools → dense explicit-state forms, no marketing chrome.
- **Voice & UX copy:** utility register, no exclamation marks: "Too blurry to read —
  retake", "Tick consent to enable the camera." Empty: "No cases yet / cases saved from
  the form appear here, red first, on every device." Error: names the failure + Retry.
  One label per intent: **Take photo** is the single primary CTA.

## 3. Color system

| Role | Color | Hex | Usage |
|---|---|---|---|
| 60% Dominant | paper | `#f0eee8` | page background |
| 30% Secondary | surface | `#ffffff` | panels, board rows, header |
| 10% Accent | ink | `#1c1c1a` | text, primary button, mark, focus ring |

Signal colours (IMCI protocol colours — the documented project exception):
`--red #a62b1f` (bg `#fbedea`), `--amber #8a5a00` (bg `#fbf1dc`), `--green #1b6b3a`
(bg `#e9f4ec`); muted text `#57544c`; lines `#d9d5cb` / `#e8e4da`.

**Usage rules:** separation = background contrast + tinted shadow (`--shadow-1/2`) —
borders only on inputs, dividers, and the pane gutter. Text pairs computed AA (16 pairs,
min ratio 5.28). Buttons: primary = ink/paper; ghost = transparent. Focus: 2 px ink
`:focus-visible`. No dark mode shipped (single theme).

## 4. Typography system

- **Personality → family:** brutalist-technical/clinical-utility → **IBM Plex Sans**
  (body/headings, weight contrast 400–700) + **IBM Plex Mono** (metadata: ids, times,
  counts, focus scores, section labels). Google Fonts, `display=swap`, preconnected.
- **Type scale:** h1 17 px/600 · sec-label mono 12 px/600 uppercase +0.1em · body
  16 px/1.55 (floor) · check label 15.5 px · hint/caption 13.5 px · mono meta 12.5 px ·
  button 15.5 px/500–600. Mobile: h1 16 px (≤420 px only). No other sizes exist.
- **Body:** 16 px never lower; line-height 1.55; measure kept ≤ ~70ch in the form pane.
- **Responsive:** scale is fixed steps, no fluid clamps needed (no display type).

## 5. Layout system

- **Containers:** form pane `max-width 660/700 px`; board pane fixed `440 px` at ≥960 px.
- **Section spacing:** 34 px between form sections (section break), 12 px inside groups,
  44 px touch rows, 10 px board row gaps — ranked tiers, not one flat gap.
- **Grid:** ≥960 px `minmax(0,1fr) minmax(0,440px)`, sticky board
  (`top: var(--header-h)`, own scroll); <960 px single column, board below with
  `#board` anchor from the header link (`scroll-margin` via `.sec`).
- **Page anatomy:** header (wordmark + board jump) → workspace (case form | board) →
  one-line footer. No hero — this is a workspace screen (App profile).
- **Conversion / CTA flow:** one primary action (**Take photo**), disabled with a visible
  reason until consent is valid; secondary actions are ghost buttons (delete/retry).
- **Breakpoints:** 420 px (compact rows), 960 px (two-pane). No horizontal rails exist.

## 6. Component system

- **Base:** native HTML/CSS — one base, no component library (vanilla app, ponytail
  ladder). Components defined once in `styles.css`: `.btn` (+primary/ghost/danger),
  `.check`, `.grp` fieldset, `.alert` (red/ok), `.qcase/.qhead/.qdetail` board row,
  `.count` pills, `.sk-row` skeleton, `.empty`.
- **Buttons:** one primary style (ink), min-height 44 px, radius 6 px, states:
  default/hover(paper)/active(scale .99)/disabled(0.42 opacity, reason text shown).
- **Forms:** checkbox rows as full-width 44 px label targets, `accent-color: ink`,
  group = surface panel + shadow; legends carry the priority colour + word.
- **Badges/counts:** mono pills, bg tint + word ("red/yellow/green") — never colour alone.
- **Navbar:** sticky 57 px, surface + 1 px line shadow-bottom only.
- **Footer:** one line, muted, disclaimer + Source link.

## 7. Card & section style

- **Style:** flat surfaces elevated by shadow (no borders around cards); radius 10 px
  (controls 6 px, rails 2 px); one elevation hierarchy (shadow-1 → shadow-2 on hover).
- **Gradients/glass:** none. No nested cards: detail opens inside the same row surface.

## 8. Icon system

- **Icons:** none imported — no icon library; the only glyphs are typographic
  (`›` chevron, `CC` mono mark). No emoji as structural icons (banned list).
- Icon-only controls: none exist (every control carries text).

## 9. Image & asset rules

- **Logo:** text wordmark + mono `CC` mark (ink square) — no image asset needed.
- **Case images:** Cloudinary delivery — thumbnails `t_queue_thumb/f_auto,q_auto`
  (52 px box, `width/height` attrs set → no CLS), full view `f_auto,q_auto` with
  intrinsic width/height attrs; `loading=lazy` below the first row.
- **User-provided images:** patient photos — consent-gated, delete on request.

## 10. Animation & interaction system

- **Library:** CSS-only. Transitions: `background/transform/opacity` 150 ms ease-out;
  skeleton pulse 1.1 s opacity alternate (the only loop). `prefers-reduced-motion`
  kills all of it.
- **States:** every interactive element has default/hover/focus-visible/active/disabled.
- **Async feedback:** board shows skeleton rows → empty/error(with Retry); upload button
  disables while the widget opens; alerts (`role=status/alert`) announce save/retake.
- **Data view states:** empty, loading (skeleton), error (+retry) — all three shipped.
- **Performance:** no JS libraries; fonts `display=swap`; images sized; only
  `transform/opacity` animated. CWV targets not separately measured (static app, noted
  as unverified rather than claimed).

## 11. Accessibility rules

- Contrast: 16 pairs computed AA (§3); rails ≥3:1 vs surface (7.03/5.93/6.54).
- Focus: `:focus-visible` 2 px ink everywhere; skip link to the form.
- Keyboard: all rows are real `<button>`s with `aria-expanded/aria-controls`; details
  toggle `hidden`; native `confirm()` for destructive delete.
- Semantics: `header/main/aside/footer`, one h1, sequential h2s, fieldset/legend
  groups, labels bound to inputs, `aria-live` on level line, status, and board list.
- Meaning never colour-only: every rail has a word ("Red — refer now").

## 12. Anti-AI-slop rules (project-specific)

- **Approved palette:** the §3 hexes only — paper/surface/ink/muted/lines + IMCI trio.
- **Pure `#000`/`#fff`:** `#ffffff` as surface (paper-tinted surroundings, deliberate);
  no pure `#000` (ink is `#1c1c1a`).
- **Concept-test verdict:** see §2 (distinctive; wizard/branding weakness fixed).
- **Gate exceptions:** IMCI red/amber/green are protocol colours (domain-mandated, not
  category reflex); borders allowed only as input outlines/dividers/pane gutter;
  no hero/landing anatomy (App profile).

## 13. Future page instructions

Reuse §3–§10 verbatim: paper+ink, Plex Sans/Mono, ranked gaps (34/14/12/10),
shadow-elevation (no card borders), one ink primary button, rails+word for status,
three states for every data view. No new visual style without updating this file.

## 14. Update policy

Any change to colours, type, components, or motion updates this file in the same commit.
