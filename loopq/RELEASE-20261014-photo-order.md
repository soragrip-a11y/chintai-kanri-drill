# LoopQ preview 20261014-photo-order-v1 — self-audit

- Removed image-ID presence as a generation prerequisite. Unlabelled individual photos map by attachment order; unlabelled montage maps top to bottom. sourceId is copied exactly from current instructions.
- Labelled montage retains explicit ID matching. Missing images, unreadable text and actual contradictory visible IDs still stop generation. Save-time ID checks remain unchanged.
- UI states that individual originals must be attached in the target-photo order. No automatic rebinding of old responses.
- Audit: reviewed single-photo questions schema, multi-photo exact IDs, generation/stop conditions, no persistence/schema/data/transmission changes, existing atomic-history guards and service-worker cache isolation.
- Validation: 49 Node tests pass, JavaScript syntax and diff checks pass. Prompt tests cover 1/3/5 photos and exact output sample IDs. Cache version test updated for this release.
- Limits: prompt compliance and correct user attachment order cannot be guaranteed. Actual ChatGPT generation and iPhone/PWA not tested here. Private beta retained.
- Rollback: rollback/loopq-before-photo-order-20261014 at 9ef36f5. Public verification required after push.
