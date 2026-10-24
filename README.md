# ClearCase — telemedicine photo triage

**Live demo:** https://clearcase-thenabbus-projects.vercel.app

A field tool for telemedicine consultations: a health worker photographs the patient
condition, the app rejects unreadable photos *while the patient is still there*, records
an IMCI-based priority from the danger-sign chart, and puts the case on a board that the
reviewing doctor opens on any device.

```
consent → danger signs (WHO IMCI) → photo
                                   ├─ focus < 0.40 → upload discarded → retake now
                                   └─ focus ≥ 0.40 → case saved with its metadata
board (any device): red first, thumbnails at 14 KB, full image on tap, delete on request
```

## Why this design

- **The blur gate is the product.** 37.6% of patient-taken telemedicine photos are
  clinically unusable (JAMA Dermatology 2023, n=1,700); real-time feedback cut bad photos
  by 68%. Cloudinary `quality_analysis` returns a focus score on every signed upload —
  below **0.40** the app shows the score and discards the upload so the worker retakes
  immediately (measured: sharp 0.57, blurred 0.10 on our test pair).
- **One write, metadata rides the photo.** The upload signature covers
  `folder + quality_analysis + context + timestamp`; `context` carries
  `level/signs/guardian`, so the board is listed server-side with no database.
- **Priority comes from the chart, not from software opinion.** Red/yellow/green follows
  the WHO IMCI danger-sign algorithm; the output is labelled a suggestion — Indian
  telemedicine rules bar software from counselling (NMC 2022 §5.7).
- **Bandwidth honesty.** `f_auto,q_auto` cut our test image 379 KB → 146 KB (61.6%);
  queue thumbnails are 14 KB (96.3%); the widget downscales to 1600 px *before* the
  first byte leaves the phone.

## Stack

- Vanilla HTML/CSS/JS — no build step, no framework, no npm.
- Cloudinary (free tier): signed uploads via the Upload Widget, `quality_analysis` gate,
  named transform `t_queue_thumb`, Admin API for the board.
- Vercel: static hosting + two 40-line serverless functions (`api/sign.js`,
  `api/cases.js`). The API secret never reaches the browser.

## Run locally

```sh
vercel dev   # signs need CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET in .env
```

## Honest limits (v1)

- No login: anyone with the URL can read the board; images are public CDN assets.
  Production needs auth + signed delivery (roadmap in the Notion doc).
- Rule-based priority, not image classification: rules stay auditable and work with no
  ML infra; an on-device classifier is the documented next step.
- The blur gate covers only the focus dimension — exposure/noise scores are paid-tier.

Documentation: Notion page (linked from the submission) · License: MIT
