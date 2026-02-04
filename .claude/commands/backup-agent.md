# Backup Agent

Create a timestamped backup of the entire `agent/` folder to `backups/agent/` (at project root, outside the agent folder).

## Steps

1. Create the backup directory if it doesn't exist: `backups/agent/`
2. Generate a timestamp in YYYYMMDD-HHMMSS format
3. Copy all files and subdirectories from `agent/` to `backups/agent/<timestamp>/`
4. List the backed up files to confirm success

Use appropriate commands for the current platform (Windows/Linux/Docker).
