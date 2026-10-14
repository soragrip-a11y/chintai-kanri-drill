# LoopQ preview 20261014-diagnostic-v1

- Public desktop browser: native instruction disclosure opens and shows 1325 characters; user iPhone non-opening symptom not reproduced. Replaced native disclosure with explicit button/hidden panel, accessible expanded state and labelled instruction field.
- Distinct duplicate-ID and unknown-ID errors. Unknown-ID diagnostic lists expected and returned safe IDs. No automatic rebind or persistence changes.
- Prompt requests immediate new-question creation and prohibits inventing/reusing IDs; inconsistent image/instruction IDs stop generation.
- 42 automated tests pass: opening/closing/reopening instructions preserves text, pending resume preserves IDs/prompt, mismatched batch fails, escape wrapper extracts, duplicate errors distinct, existing history tests pass.
- Model ID transcription, actual iPhone/PWA behavior, new UI visual verification and full device/offline/storage gates remain unverified. Private beta retained. No claim of root cause for user iPhone behavior or ID mismatch provenance.
- Rollback: rollback/loopq-before-diagnostic-20261014 at 6edd8d5. Deployment requires push and public verification.
