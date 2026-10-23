# ClearCase — Telemedicine Image Triage for Rural Communities

> **Catch a bad photo before the patient leaves the room.**

A mobile-first web app for frontline health workers in low-bandwidth areas: photograph the
patient's condition → Cloudinary instantly checks whether the photo is sharp enough to trust
→ a WHO-IMCI-grounded danger-sign checklist suggests a **red / yellow / green priority** for
the reviewing doctor → the doctor sees an urgency-sorted queue.

Built for **Hacktober HackDays 2026** (SheBuilds × Cloudinary × Notion) · Team **Coffee Beans**.

## Why

- Only **62.4%** of patient-taken telemedicine photos are good enough for clinical use —
  blur, bad lighting and bad cropping are the usual reasons. Real-time feedback cut bad
  photos by **68%** in a published pilot (JAMA Dermatology 2023, n=1,700).
- Original field photos are multi-MB; on rural links (rural teledensity 59 vs urban 134,
  PIB) the upload times out. `f_auto` + `q_auto` cut this sample image **61.6%** (379 KB →
  146 KB); a queue thumbnail is **12 KB**.
- A red/yellow/green that a remote doctor can trust must come from a protocol, not a
  vibe: the checklist is the **WHO IMCI chart**, whose own colour scheme (pink/yellow/green)
  this maps onto.

## How it works

1. **Consent** — explicit, unticked checkbox; guardian consent required for under-18.
2. **Capture** — Cloudinary Upload Widget (camera), client-side downscale to 1600 px *before*
   upload, upload **signed** by a 12-line Vercel function (API secret stays server-side).
3. **Blur gate** — `quality_analysis` returns a focus score (0–1). Real measurements on this
   cloud: sharp sample **0.57**, blurred sample **0.10** → below `0.4` the app says *retake,
   now, while the patient is still there*.
4. **Priority** — tick IMCI danger signs → suggested red / yellow / green with guidance text.
5. **Doctor queue** — sorted red first, thumbnails via `t_queue_thumb` named transformation +
   `f_auto,q_auto`, tap for the full-resolution image.

## Cloudinary features used (all free tier)

| Feature | Where |
|---|---|
| Upload Widget (`camera`, `maxImageWidth: 1600`) | capture screen — fixes the upload bottleneck |
| Signed uploads via `/api/sign` | secret never in client code |
| `quality_analysis` focus score + threshold | the blur gate (retake prompt) |
| `f_auto` + `q_auto` | every delivery URL — measured 61.6% saving |
| Named transformation `t_queue_thumb` | doctor-queue thumbnails (12 KB) |
| `folder=clearcase_cases` (signed) | server-decided asset location |

## Demo

**{{DEMO_URL}}**

3-minute script: throttle to Slow 3G → original vs delivered size → photograph something
blurry → retake gate fires with the score → tick one danger sign → red case lands on top of
the queue.

## Run locally

Static files, no build step: any static server works for the UI, but the upload signing
endpoint (`api/sign.js`) needs the Vercel runtime — `vercel dev` serves both.

```
vercel dev
```

Set `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` as Vercel env vars (project → Settings →
Environment Variables). The client only ever sees the cloud name (`ydyp2esm`).

## Privacy & scope

- Consent-based photos, guardian gate for minors, `noindex` meta, no third-party analytics.
- **Decision-support, not a diagnosis** — Indian telemedicine rules (NMC 2022 §5.7) do not
  allow software to counsel patients; the reviewing doctor decides.
- Honest limits are tracked in the [project journey on Notion](https://guptanavya.notion.site/ClearCase-Telemedicine-Image-Triage-for-Rural-Communities-Hacktober-HackDays-2026-4028e77aa25881699fb2f56a974fe92b).

## Repo layout

```
index.html      the four screens (consent → photo → signs → priority) + queue
styles.css      mobile-first, no framework
app.js          widget setup, blur gate, IMCI checklist logic, localStorage queue
api/sign.js     Vercel function: signs uploads, secret stays server-side
```
