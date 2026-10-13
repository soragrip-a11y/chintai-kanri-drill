---
name: pwa-release-validation
description: Check LoopQ deployment readiness with Safari/PWA functional testing, offline/update behavior, migrations, backup restores and truthful launch reporting.
---

# PWA and product release gate

Use before publishing a LoopQ change or claiming release complete.

1. Check repository branch and deployed origin. Keep the previous public build on a verified rollback reference. Feature branches and local files are **not** production releases.
2. Test actual browser workflows: capture (jpeg/png/HEIC support or correct fallback), local save, reopen, image thumbnail, manual question, quiz, wrong-answer mark, bookmark, export, restore, delete, reload and offline restart.
3. Test iPhone Safari and Home Screen installation separately; also Android Chrome and desktop. Check keyboard, safe areas, horizontal scrolling, screen readers and error handling for permissions.
4. Test storage pressure and quota exceeded behavior; 100/1,000/10,000 image cases with realistic size distributions. Ensure review doesn't eagerly load every full photo. Show user-visible storage usage/limits and backup reminders.
5. Test untrusted/malformed import and migration from old schema; verify transactions, no loss of existing data and recovery from interrupted operations.
6. Verify service-worker caching/version updates, secure HTTPS, PWA manifest/start_url/icons, and no cached obsolete price or auth disclosures.
7. If AI is disabled because plan-sharing access is not approved, disable buttons with clear wording; do not show fake active status or a successful-connection badge.
8. Run static syntax/test suite *and* end-to-end smoke tests. Note environment-blocked tests explicitly; mock-only successes do not justify launch claims.
9. Publish release notes: features actually available, blockers, QA coverage, limitations, link and rollback instructions.

Release criteria: all privacy, data integrity, quality, device and authorization gates pass. Otherwise ship only a clearly marked preview, or keep the production site unchanged.
