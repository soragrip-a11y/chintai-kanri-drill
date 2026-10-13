---
name: local-first-security
description: Review LoopQ image capture, IndexedDB, JSON import/export, OAuth and AI data flow for privacy, XSS, cost and abuse risks.
---

# Local-first privacy and security gate

Use for any edits involving photographs, AI requests, login, backup, restore, source cards or cloud services.

1. Draw a data-flow diagram: browser/camera → local storage → optional authorized AI request → model output → local library. Clearly separate user's data, vendor data and operator systems.
2. Validate imported backup shape before any writes. Use limits for file bytes, image MIME/data URI, image byte count, record count, string lengths, question answer booleans, references and future schema migrations. Stage and commit atomically; no partial restore.
3. **No string interpolation of user-provided image URLs/attributes into `innerHTML`.** Prefer DOM creation and `img.src` assignment after validating an expected `data:image/jpeg|png|webp` type. Use `textContent` for untrusted text.
4. Photos are private study artifacts. Treat containing personal information and copyrighted printed material as possible. Obtain affirmative per-upload consent before transmitting to AI; explain the processor, retention and data handling.
5. OAuth login alone does not imply ChatGPT plan-sharing scope. Hosted-site plan-sharing requires an authorized integration. Do not bypass developer enrollment, request user's ChatGPT password, place OAuth tokens in localStorage, or create an operator-billed API fallback.
6. Handle browser quota, persistent-storage support, private browsing and storage eviction. Use image blobs/thumbnails instead of huge base64 strings, incremental queries, export/import with verified checksums, and realistic storage limits.
7. Protect against request flooding/cost explosions if a backend is ever deployed: authenticated server-side quotas, atomic counters, fail-closed controls, billing alerts and abuse detection. CORS and a shared PIN are not sufficient.
8. Add tests for hostile backup fields such as `x" onerror="alert(1)`, oversized images, partial restore, spoofed qualification names and broken data URLs.

Release criteria: no untrusted-markup injection, no undeclared transmission, no operator billing surprise, successful tested backup/restore and rollback path.
