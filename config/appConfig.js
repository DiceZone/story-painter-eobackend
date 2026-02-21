// Centralized file-based config for both Pages (src) and Functions runtimes.
// Edit FRONTEND_URL here if you prefer file-based configuration.
// Environment variable FRONTEND_URL still has higher priority at runtime.
export const FRONTEND_URL = 'https://log.test.error.com/';

// Log retention policy - Set the number of days to keep logs
// Logs older than this will be automatically deleted when new logs are uploaded
// Can be overridden by environment variable LOG_RETENTION_DAYS
export const LOG_RETENTION_DAYS = 30;
