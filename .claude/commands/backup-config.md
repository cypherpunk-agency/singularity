# Backup Agent Context

Create a timestamped backup of the `agent/context/` folder to `backups/context/` (at project root).

## Steps

1. Create the backup directory if it doesn't exist: `backups/context/`
2. Generate a timestamp in YYYYMMDD-HHMMSS format
3. Copy all files from `agent/context/` to `backups/context/<timestamp>/`
4. List the backed up files to confirm success

Use appropriate commands for the current platform (Windows/Linux/Docker).
