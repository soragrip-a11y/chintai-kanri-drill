# LoopQ preview 20261014-input-size-v1 — input zoom audit

- Mobile/narrow and coarse-pointer form controls now use max(16px, 1em) before focus. The final stylesheet rule overrides 13px batch textareas and 15px inherited fields, including the legacy 12px handoff control. Landscape touch devices are covered by any-pointer:coarse.
- No viewport zoom restrictions, focus handlers, scroll behavior, storage code or question-generation changes.
- Independent read-only code audit confirmed that input preview updates do not replace/focus the textarea or trigger zoom/scroll. Existing small form fonts are consistent with the reported iPhone focus magnification.
- Specificity audit: .layout textarea equals .batch-flow textarea and wins by later order; .layout .handoff-card .code-input overrides the legacy handoff rule. Base field selectors also have lower/equal specificity. Pinch/browser zoom remains available.
- All 49 existing Node tests pass; diff checks pass. No iPhone Safari/PWA keyboard/visualViewport test was available. This change removes the identified font-size trigger; it does not claim that OS keyboard scrolling can be disabled.
- Private beta retained. Rollback: rollback/loopq-before-input-size-20261014 at f5c24e4. Public verification required after successful push.
