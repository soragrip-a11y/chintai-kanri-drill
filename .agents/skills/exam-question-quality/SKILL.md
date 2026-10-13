---
name: exam-question-quality
description: Validate generated exam questions for exact legal accuracy, comparable exam difficulty, independent wording, and traceable current primary sources before use in LoopQ.
---

# Exam question quality gate

Use for creating, reviewing or publishing any LoopQ exam questions or explanations.

1. Record subject, jurisdiction, exam, examination-year cutoff, source photograph/topic, and item difficulty before generation. Do not automatically publish images, original questions or outputs.
2. Extract **abstract tested concepts**, traps, exceptions and conditional reasoning. Do not preserve the publisher's original scenarios, distinctive language or ordering as a rewrite template.
3. Draft exactly 3 new independent scenarios, at least two interacting legal or practical conditions each; keep the target exam's difficulty. For multiple choice, independently validate every distractor; for ○×, avoid generic definition-only items.
4. Verify using a *current primary source* (enacted law, regulation, regulator's circular, official syllabus). The cited section and effective date must actually support the claim. Do not invent citations, use unverified secondary summaries as sole basis or pretend to have checked a website that was not fetched.
5. Perform second-pass verification independently. Check answer uniqueness, contradictions, exceptions, cutoffs, implausible premises and overlap with source. When uncertain, mark **review required** and prevent automatic inclusion in practice sets.
6. Preserve an evidence trail with citation URL, verified date, clause and rationale; keep publisher image only on the user's device. Provide a user-facing report issue control.
7. Evaluate difficulty with a real sample: skilled beta testers or held-out items; compare error rates and reasoning quality, not solely the model's own confidence.

Release criteria: every published question has an explicit answer, rationale, primary source, source-effective date, legal-check state, and no unresolved copyright similarity concern. Never state 100% guaranteed correctness.
