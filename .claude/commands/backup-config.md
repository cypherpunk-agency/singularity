# Backup Agent Config

Create a timestamped backup of the `agent/config/` folder to `agent/archive/config-backups/`.

## Steps

1. Create the backup directory if it doesn't exist: `agent/archive/config-backups/`
2. Generate a timestamp in YYYYMMDD-HHMMSS format
3. Copy all files from `agent/config/` to `agent/archive/config-backups/<timestamp>/`
4. List the backed up files to confirm success

Use appropriate commands for the current platform (Windows/Linux/Docker).
