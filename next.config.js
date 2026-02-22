/** @type {import('next').NextConfig} */

function getLogRetentionDays() {
  // 1. 从environment取
  if (process.env.LOG_RETENTION_DAYS) {
    const days = parseInt(process.env.LOG_RETENTION_DAYS, 10);
    if (!isNaN(days) && days > 0) {
      console.log(`[Build] Using LOG_RETENTION_DAYS from environment: ${days}`);
      return days;
    }
  }

  // 2. 从appConfig.js取
  try {
    const appConfig = require('./config/appConfig.js');
    if (appConfig.LOG_RETENTION_DAYS && appConfig.LOG_RETENTION_DAYS > 0) {
      console.log(`[Build] Using LOG_RETENTION_DAYS from appConfig.js: ${appConfig.LOG_RETENTION_DAYS}`);
      return appConfig.LOG_RETENTION_DAYS;
    }
  } catch (err) {
    console.warn(`[Build] Failed to read appConfig.js: ${err.message}`);
  }

  // 3. 默认30天
  console.log('[Build] Using default LOG_RETENTION_DAYS: 30');
  return 30;
}

const nextConfig = {
  output: 'export', // 生成静态HTML
  env: {
    NEXT_PUBLIC_LOG_RETENTION_DAYS: String(getLogRetentionDays()),
  },
};

module.exports = nextConfig;
