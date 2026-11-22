# Private data backups

GitHub contains code, not the live database. Machine-local configuration in `.data/backup-config.json` enables encrypted daily database snapshots while the development or preview server runs. It checks each minute and catches up on the next start. Failures are recorded in `.data/backup-status.json`; a failed backup never advances the last-success time.

The configured destination is the Windows-registered **Personal** OneDrive folder, never the generic OneDrive environment variable (which points to Canova Clay on this computer). OneDrive must be running and signed in to upload files; local file creation does not prove cloud upload.

Archives use AES-256-GCM and a separate random recovery key. Each archive is authenticated, extracted to a temporary local directory and checked for SQLite integrity, foreign keys and table counts before publication. Live WAL data is captured with SQLite's backup API. Retention removes only matching backup files older than 30 days after a successful backup and always preserves the two newest copies.

Included: server database, locally stored integration master keys and encrypted Theory runtime configuration. Uploaded content stored in database records is included. Browser-only drafts, source code, logs and arbitrary external files are not included. Current maximum uncompressed data is 128 MiB; exceeding it records a failure rather than silently omitting data.

The recovery key is `.data/backup-recovery.key`. Keep a separate secure copy in a password manager or other safe location outside the backup folder. Losing this computer and the only key copy makes encrypted backups unrecoverable. Never commit the key or publish it in chat.

For recovery, stop the application and use `restoreBackup({archive,keyFile,destination})` from `server/backup.mjs` with a **new** destination directory. It refuses to overwrite existing data. Review restored runtime settings locally and configure the server to use the restored database and matching integration keys. Do not upload decrypted recovery files to GitHub.

Authenticator enrolment secrets are encrypted using `mfa-master.key`. Encrypted archives include this key when present; restore it together with the database. Recovery codes are stored only as hashes. Losing the key prevents authenticator verification.
