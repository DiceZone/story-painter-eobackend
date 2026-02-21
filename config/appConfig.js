// Centralized file-based config for both Pages (src) and Functions runtimes.
// Edit FRONTEND_URL here if you prefer file-based configuration.
// Environment variable FRONTEND_URL still has higher priority at runtime.
export const FRONTEND_URL = 'https://log.test.error.com/';

// Log retention policy - Set the number of days to keep logs
// Logs older than this will be automatically deleted when new logs are uploaded
// Can be overridden by environment variable LOG_RETENTION_DAYS
export const LOG_RETENTION_DAYS = 60;

// Backup upload API - Used when KV storage fails
// The log will be POSTed to this endpoint as JSON if KV storage becomes unavailable
// Format: { uniform_id, name, logdata (base64), timestamp }
// Can be overridden by environment variable BACKUP_UPLOAD_API
export const BACKUP_UPLOAD_API = 'https://log-api.dice.zone/api/dice/backup-upload';
