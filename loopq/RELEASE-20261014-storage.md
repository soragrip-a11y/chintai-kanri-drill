# LoopQ private beta storage fixes — 2026-10-14

Base: `47e9d32bde20791d926298667921761ea68fccd5`. Original development checkout remains untouched; isolated clone used.

- Answer saves update memory only after IndexedDB commits, without reading every full photo again. Explicit aborts reject instead of hanging. Startup still loads the full library; large-photo scalability is not solved.
- Backup downloads split at 75 MiB and 10,000 records, matching restore limits. Each part is schema-validated before links are offered. Download every part and restore each in sequence. Each part is atomic; the whole multipart collection is not one transaction. Existing data is never cleared.
- Restore preserves the optional final answer timestamp, with validation.
- Legacy app cache cleanup removes only `chintai-drill-*` caches and no longer removes LoopQ caches.
- Generated question field length limits were already consistent with restore; no change required.

Validation: all 48 Node tests pass. New coverage includes UTF-8 byte limits, multipart round trips, 100/1,000/10,001 metadata records, timestamp restoration, cache isolation, abort handling, and no full-library read on single-record persistence.

Fresh Edge headless profile, local server, synthetic photo only: photo add, instruction open, malformed JSON rejection, three-question import, answer/scoring, navigation, reload persistence, download, restoration into a second empty browser context, offline reload, 390px/1280px overflow checks, no JavaScript errors. Mobile screenshot inspected. No existing user browser storage touched.

Not verified: physical iPhone Safari/Home Screen, Android device, HEIC/camera hardware, real storage pressure, 100/1,000/10,000 full-photo stress, live ChatGPT generation or factual question quality. Existing private-beta status retained; this is not general release readiness.

Rollback: `rollback/loopq-before-storage-20261014` points to the base commit. Deployment and public verification are recorded separately after push.
