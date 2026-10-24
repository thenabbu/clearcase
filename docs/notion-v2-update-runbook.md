# Notion v2 update runbook (execute when connectors + egress recover)

Page: guptanavya.notion.site ClearCase (root block id 4028e77a-a258-81e0-b092-c94bfb9b662e)

## 0. Pre-flight
- `curl -m10 https://clearcase-thenabbus-projects.vercel.app/api/cases` must return 200 JSON.
  If it lists ANY cases (e.g. DUT case `clearcase_cases/zlicgjhzgydkwtsy9g9m`), DELETE each
  via `curl -X DELETE .../api/cases -H 'Content-Type: application/json' -d '{"public_id":"..."}'`
  until `[]` — judges must open an EMPTY board (no test data).
- Notion tools back: `tool_search('notion')` + `manage_connections status`.

## 1. Delete stale v1 blocks (old-UI screenshots + captions)
DELETE_BLOCK ids (extracted from insert echo, verify against live fetch before deleting):
- image 1-consent.png        4038e77a-a258-8124-975a-d2e988282f6d
- caption (consent)          4038e77a-a258-813f-8098-e290329ac37f
- image 2-upload-widget.png  4038e77a-a258-81f9-b16b-d2b18d50b966
- caption (widget)           4038e77a-a258-81f0-8aa5-f17e6490b108
- image 3-blur-gate-retake   4038e77a-a258-81c5-bdc7-d118eb38b7b3
- caption (retake)           4038e77a-a258-8119-97fb-c9c4e7b24cfc
- image 4-doctor-queue       4038e77a-a258-81cf-a896-ecd9d3c6a4bf
- caption (queue)            4038e77a-a258-81a3-8bac-ea6d07aa9a70
Max 10 calls per tool_call batch; connectors__ names only (no stray characters!).

## 2. Insert v2 evidence (ADD_MULTIPLE_PAGE_CONTENT, `after` = "Live evidence" heading id
— confirm live by text match "Live evidence — screenshots"; echo candidate 14d4949c-d174-44f0-9b9d-13c6ef131670)
Images (raw.githubusercontent.com/thenabbu/clearcase/main/docs/screenshots/):
1. 1-desktop-two-pane.png — "1 · Two-pane workspace at 1280 px — case form left, live board right (red case saved)."
2. 2-mobile-stacked.png — "2 · Mobile (375 px) — form stacks above the board; one primary action."
3. 3-upload-widget.png — "3 · Cloudinary Upload Widget — My Files + Camera sources over the app."
4. 4-board-case-saved.png — "4 · Saved case on the board — priority rail, mono metadata, expandable detail with guidance, checklist and delete."

## 3. Insert v2 build-log entry after §8 entry id 4038e77a-a258-8151-952b-fc9fd4e5aaf1
(text anchor: "24 Oct overnight — build complete…"). Entry: production rebuild after review —
two-pane instrument (DESIGN_SYSTEM.md committed), board moved from localStorage to a server-backed
Cloudinary roundtrip (/api/cases list+destroy; case metadata rides the signed upload as pipe-format
context `level=|signs=|guardian=`), demo seeds removed, wizard removed. Verified: full server E2E
(upload → context3-key roundtrip → list parse → destroy → empty board), DUT assertions (gating,
blur gate0.09→discard vs0.53→save, board render, zero JS errors),16/16 contrast pairs computed AA,
rendered at375/768/1280 via headless Chromium + vision review passes.

## 4. Stale-text sweep (FETCH full page, grep, patch)
Terms: 'localStorage', 'Load 2 sample', 'GitHub Pages', 'prompt', '4 steps', 'queue screen',
'Doctor queue' (→ 'board'). §13 checklist: demo URL + GitHub lines must be current.

## 5. Final checks
- Public URL of the page loads in a fresh client (Navya must publish via Share→Publish first).
- Submit pack unchanged (see chat report24 Oct).
