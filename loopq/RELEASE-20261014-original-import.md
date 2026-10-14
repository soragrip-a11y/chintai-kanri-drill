# Original-question JSON import (public preview)

## Available changes

- An explicit “元の問題をそのまま取り込む（JSON）” entry under Add, plus a link from the generated-question screen.
- Imports 1–1,000 original true/false questions from a JSON file or pasted JSON. It preserves problem/explanation strings, original IDs, source filename and page references. Topic groups become separate sets; groups over 100 questions are split into restorable sets.
- Does not generate replacement questions, perform OCR, parse PDF files, infer answers, validate laws, transmit files or call a paid API. Image/PDF content must first be transcribed into the documented JSON format. Multiple-choice questions are not yet supported.
- Missing/null answers remain explicitly unconfirmed and never enter graded practice. Their full original text remains viewable in the set details.
- New records are validated and saved atomically. Existing sets/history are never replaced. The exact same normalized import data and qualification produce deterministic IDs, preventing that exact import from being repeated. Changing the imported metadata or content produces a different import identity.
- The existing photo → exactly three generated questions workflow stays separate and unchanged.
- Backups preserve original metadata, answer status and study history. Older app versions do not understand these added original records; use this version or newer when restoring a backup that contains originals.
- Pending/failed file selection blocks saving stale textarea content until the selected file validates or the textarea is explicitly edited.

## JSON shape

Required: an object containing a `questions` array. Each item requires a nonempty `statement` string. `answer` is boolean or null (missing is treated as null, never false). Optional question fields: `originalId`, `topic`, `explanation`, `reference`, `trap`, `sourcePage`, `answerPage`. Optional root fields: `format` (`loopq.original.v1`), `title`, `exam`, `sourceFile`, `sourceSha256`, `notice`.

Limits: 1,000 questions, 1,000,000 input characters, 3,000,000 file bytes; statement 2,500 characters, explanation 5,000 characters, reference/trap 1,500 characters. No silent truncation of question text.

## Verification

- `node --test loopq/*.test.cjs`: 69 passed, including 10 new original-import tests and the existing strict-three, history, quota and backup regressions.
- `node --check loopq/*.js` (each file): passed.
- Independent review: real 168-question private fixture imported as 21 sets of 8; all 1,512 question fields checked unchanged; 81 true/87 false retained; storage → backup → restore deep-equal.
- Independent transaction-double tests: second-write quota failure and stale-memory duplicate collision both roll back all newly attempted inserts; existing records and history retained.
- Real local Chromium smoke was attempted but could not launch in the available executor (sandbox socket restriction; escalation wrapper failed). The separate cloud browser could not reach that executor's localhost. `original-browser-smoke.py` is included for a connected environment; this run was not a browser pass.
- iPhone Safari, installed iOS PWA, physical device storage pressure and cross-device migration are not verified by these tests. This remains a preview, not a full release-readiness claim.

No user PDFs, original problem contents, answers, photos or private fixture files are included in this repository change.

## Rollback

Previous production commit: `ecbebeeecc07c534be8abf686407561efab8d6b0`. Before publication, retain it as `rollback/loopq-before-original-import-20261014`. To roll back code, restore the previous LoopQ assets and publish with a fresh service-worker cache version; back up local study data before any restore or migration. Do not delete IndexedDB to roll back the UI.
