# Visible count stepper and direct JSON prompt

- Always-visible 10–100 question count, default 10, up/down buttons changing by 10, readonly count, keyboard ArrowUp/ArrowDown, accessible names and 44px targets.
- Selected count is repeated in the immediate-generation prompt. Output instruction requires exactly one JSON code block without surrounding prose; routine start/count/approval confirmations are discouraged. Essential factual ambiguity remains an exception; verified sources must never be invented.
- Unspecified legal baseline uses the answer date and an explicitly stated jurisdiction. External ChatGPT output behavior cannot be guaranteed by this app.
- Existing storage, import, grading, history and popup/copy race protections unchanged. Old count drafts are visibly rounded up/clamped to a supported selection on mount.

Validation: 15 focused topic tests passed using a V8 test adapter executing the actual module and mock DOM/clipboard, including 10→20→copy, min/max, keyboard, persistence, stale copies and import-schema parsing. JavaScript syntax checked. After the executor recovered, the actual candidate checkout passed the complete Node suite: 133 tests, 115 passed, 0 failed, 18 explicitly skipped retired UI tests. Independent review found no functional blockers. Browser screenshot testing was attempted but Chromium still failed to start under socket restrictions; no real-device or visual pass is claimed.
