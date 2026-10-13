# LoopQ — project instructions

This repository contains the publicly hosted legacy **Chintai Kanrishi Drill** and work toward **LoopQ**, a local-first exam learning app. Do not overwrite the public website just to deploy a prototype. Keep a rollback branch and validate migration before a release.

Before modifying exam/AI/photo functions, read the relevant reusable project skills:
- [Exam quality](.agents/skills/exam-question-quality/SKILL.md)
- [Local-first security](.agents/skills/local-first-security/SKILL.md)
- [PWA release validation](.agents/skills/pwa-release-validation/SKILL.md)

**Hard constraints**
1. The user owns the original question photos. Store them locally unless explicit, per-action AI processing consent is obtained. Do not redistribute screenshots or original publisher problem statements.
2. Never put operator-paid OpenAI API keys or OAuth access tokens in a public page. Never silently fall back to the operator's paid API. ChatGPT plan-sharing must follow OpenAI's applicable hosted-app approval/permission requirements.
3. New questions must preserve exam-level difficulty; do not lightly paraphrase protected wording. A second model pass alone is not a legal/factual guarantee. Require traceable primary sources and a review/flag state for uncertain answers.
4. Treat import files and all generated/model-provided text as untrusted. Prevent HTML injection; validate types, sizes, records, URL schemes and schema versions before import.
5. Backups, restore, iOS Safari, storage pressure, migration, offline mode and actual device tests are release gates, not optional polish.
6. Identify current production vs local prototype truthfully; do not claim integration, review or deployment before verification.

Run existing syntax/tests where available. Explicitly record tests that are blocked or unrun. Review [the audit](AUDIT-2026-10-14.md) before preparing a new public release.
