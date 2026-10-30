# ClearCase — telemedicine photo triage

**Live demo:** https://clearcase-phi.vercel.app

A field tool for telemedicine consultations: a health worker photographs the patient
condition, the app rejects unreadable photos *while the patient is still there*, records
an IMCI-based priority from the danger-sign chart, and queues the case for the reviewing
doctor on any device.

Two roles, one demo login each — no passwords, prefilled accounts:

| Role | Enters as | Does |
|---|---|---|
| Field | Asha Devi, ASHA worker | capture a case, gate the photo, submit |
| Clinical | Dr. Meera Rao, reviewing physician | work the queue, accept or escalate |

```
sign in → consent + patient + danger signs (WHO IMCI) → photo
                                                      ├─ focus < 0.40 → upload destroyed → retake now
                                                      └─ focus ≥ 0.40 → case queued with all metadata
doctor queue: red first, blurred thumbnails until opened, accept / escalate, delete on request
```

## What Cloudinary actually does here

Seven jobs, none decorative:

1. **`quality_analysis` as a clinical gate** — every signed upload returns a 0–1 focus
   score. Below **0.40** the client destroys the asset immediately and the worker retakes
   while the patient is present. Measured on our test pair: sharp 0.567 saved, blurred
   0.093 discarded. The rubric asks for Cloudinary "beyond basic implementation"; this is
   a decision the product makes, not a CDN hop.
2. **Metadata as `context` instead of a database** — `level / signs / guardian / patient /
   age / village / complaint / notes / review / focus` ride the upload as pipe-format
   context. The board is one Admin API list call. There is no DB, no migration, no state.
3. **`t_queue_thumb`** — named transform, 320 px fill on **`g_face`**, so a thumb always
   frames the subject rather than the middle of the frame.
4. **`t_privacy_thumb`** — the same transform plus **`e_blur_faces`**. Every photo on the
   worker's shared board is face-anonymised; only the reviewing clinician sees the
   clinical view. Verified against a face photo: identity unrecoverable.
5. **`t_case_view`** — 1200 px limit for the doctor's detail view, so a phone on a rural
   connection never pulls a multi-megabyte original.
6. **`f_auto,q_auto`** everywhere — our test image went 379 KB → 146 KB (61.6%); the
   board thumbnail is 14 KB (96.3% smaller).
7. **Signed uploads** — the signature is minted server-side in a 40-line function and
   covers exactly `folder + quality_analysis + tags + context + timestamp`. The API secret
   never reaches the browser. The second, tiny `/api/score` call writes the measured focus
   back into context, because the Admin listing does not return `quality_analysis`.

The Upload Widget also downscales to 1600 px *before the first byte leaves the phone* —
the field worker's connection pays for a small file, not a 12 MP original.

## Priority is a chart, not an opinion

Red/yellow/green follows the WHO IMCI danger-sign algorithm, read from the WHO chart
booklet. The UI calls the result a **suggestion for the reviewing doctor** — NMC
Telemedicine Guidelines 2022 §5.7 bars software from counselling or prescribing, so the
output is decision support and the registered practitioner delivers the advice.

## Stack

- Vanilla HTML/CSS/JS — no build step, no framework, no npm, no bundler.
- Cloudinary free tier: Upload Widget, `quality_analysis`, context metadata, three named
  transformations, Admin API for listing and for context writes.
- Vercel: static hosting + five serverless functions (`auth`, `sign`, `score`, `cases`,
  `seed`). Session is an HMAC-signed HttpOnly cookie — no auth service, no user table.

## Run locally

```sh
cp .env.example .env      # fill CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET / SESSION_SECRET
vercel dev
curl -X POST "localhost:3000/api/seed?token=$SEED_TOKEN"   # once, to create the demo cases
```

`?demo=worker` or `?demo=doctor` on the URL auto-signs in — used for screenshot QA.

## Honest limits

- The login is a **demo identity switch, not authentication**: there is no user store, so
  anyone who clicks Doctor is the doctor. Real deployment needs an identity provider, and
  the role claim has to come from that provider rather than from a request body.
- Delivery is public-CDN, not signed URLs: the faces are blurred in the transform, but the
  original asset URL is still readable if you already know the `public_id`. Production
  moves to `type: authenticated` with signed delivery.
- The blur gate covers the focus dimension only. Exposure/noise/lighting scores exist but
  are a paid extended-analysis beta, so they are deliberately not promised.
- Priority is rule-based, not image classification. Rules stay auditable and need no ML
  infra; an on-device classifier is the documented next step, not a claim.
- Seeded cases are marked **sample** in the UI — they are stock images standing in for
  clinical photos, and the app never presents them as real patients.

Documentation: Notion page (linked from the submission) · License: MIT
