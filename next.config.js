/** @type {import('next').NextConfig} */
import { LOG_RETENTION_DAYS as CFG_LOG_RETENTION_DAYS } from './config/appConfig.js';

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
  if (CFG_LOG_RETENTION_DAYS && CFG_LOG_RETENTION_DAYS > 0) {
    console.log(`[Build] Using LOG_RETENTION_DAYS from appConfig.js: ${CFG_LOG_RETENTION_DAYS}`);
    return CFG_LOG_RETENTION_DAYS;
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

export default nextConfig;
