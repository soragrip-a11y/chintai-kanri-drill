# LoopQ preview: 20261014-transfer-v1

- Removed combined image/text clipboard button and PNG clipboard conversion.
- Main flow: 1 copy exact instructions, 2 save JPEG montage, 3 open ChatGPT, attach montage and paste instructions.
- Clipboard denial opens the manual-copy instructions panel.
- No database/schema/history-write changes; no new automatic transmission.
- Validation: JavaScript syntax, diff whitespace checks, 37 automated tests pass (including history protection and separate-copy UI).
- Physical iPhone Safari/PWA paste/download, offline update and broad device/storage tests remain unverified. Existing private beta status retained.
- Previous build rollback: rollback/loopq-before-transfer-20261014 (06e53af).
- Deployment is not confirmed until GitHub push and public version verification succeed.
