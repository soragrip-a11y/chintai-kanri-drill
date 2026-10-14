# Backup recovery after four or more correct-answer days

This preview patch preserves existing success-day counters rather than truncating them to the three-day mastery threshold. It fixes export/restore rejection after additional review of mastered questions. The implementation is the independently audited change from 80065213f0cda9c440f5882810b80a06e2629df7, applied on public baseline a0baaf650f70ac490026a20869a5717b43d2e268 without the unrelated AI evaluation work.

Validation: browser backup/restore with synthetic photos and counters 3, 4 and 30; fourth-day answer; separate-browser-context restore; further scoring and reload retention; old v17 to v18 service-worker control transition preserving IndexedDB and unrelated caches; offline backup after update. Automated app suite: 53 tests. Physical iPhone Safari/Home Screen validation remains unverified; this remains a preview. No live AI, credentials or paid API behavior changed.

The cache is loopq-v18-backup-days-20261014 and asset query version is 20261014-backup-days-v1. Refresh online to receive the update before relying on it offline. No data reset or migration is required.

Rollback reference: a0baaf650f70ac490026a20869a5717b43d2e268 (retained as audit-rollback-a0baaf6 in the isolated release checkout). If rollback is necessary, use normal revert commits for the release changes, update the cache version, and preserve IndexedDB; do not force-push or erase site data. Rolling back also restores the old backup rejection, so preserve a verified backup first.
