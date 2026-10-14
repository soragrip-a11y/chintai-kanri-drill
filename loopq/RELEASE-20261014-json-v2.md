# LoopQ preview 20261014-json-v2

- Single and batch prompts request one json fenced block, valid JSON punctuation, no math/LaTeX delimiters, exact IDs and pre-output structure checks.
- Handoff tells users to copy using the code-block copy button.
- Parse failures distinguish math delimiters outside strings from malformed quotations and generic truncated/invalid JSON. No inferred bracket repair or answer/content changes.
- Existing database schema and persistence unchanged. Local images stay local until user attaches them in ChatGPT.
- Syntax checks and 39 automated tests pass. Tests cover malformed math structure rejection, preserving math/quotes inside valid strings, single/multi prompt requirements, history protection.
- Actual iPhone/PWA, external model compliance and broad offline/storage checks unverified; private beta retained. Prompting cannot guarantee valid model output.
- Rollback: rollback/loopq-before-json-v2-20261014 at 3262cf6.
- Public deployment requires successful push and public version verification.
