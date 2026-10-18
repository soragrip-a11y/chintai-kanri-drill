# Topic → ChatGPT prompt → JSON → study

Preview release, 2026-10-18.

- Primary home actions: create questions, import JSON, weak review, all review.
- Topic is the only required prompt input. Optional count defaults to 10 (1–50).
- A single action prepares/copies the local prompt and opens ordinary ChatGPT. User pastes and sends; user brings the resulting JSON back. No API invocation, keys, account-linking or automatic sending.
- Photo auto-generation is a noninteractive “開発中” notice only. Active camera, photo generation, sharing, manual-entry and local-AI connection paths are removed from this public app. Legacy bookmarks route to topic entry.
- Existing DB/version/store keys, records, legacy image payloads, original banks, grading history and checkpoints retained. No automatic data migrations/deletions or question rewriting.
- `loopq.original.v1` input, code fences, missing-answer exclusion, duplicate protection and atomic save retained. Preview/save feedback preserved.
- Quiz resume, Previous and right-positioned Next retained.
- Service worker updated; current-cache offline lookup tolerates version query strings.

## Verification

- Node suite: 131 tests: 113 passed, 0 failed, 18 explicitly skipped retired photo/raw-text UI tests. Replacement topic/JSON integrations and all storage/history/parser checks run.
- Both existing private 50-question banks: 50 questions parsed and validated into five sets, all 50 retained. Fixtures are not published.
- JS syntax and whitespace checks pass.
- Real Chromium/IndexedDB/mobile screenshot QA attempted but browser process could not start under executor socket restrictions. Permitted alternate launch also failed due an environment mount error. Actual iOS/Safari/Android and PWA update/offline visual checks remain unrun. This is explicitly a preview, not a device-verified release.

Rollback reference: `rollback/loopq-before-topic-20261018`, at b5a207b28e189151249415adcd138a995725ce8a. Revert this release's code commit if needed; do not clear browser data.
