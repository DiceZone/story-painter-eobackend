// Utility functions
function generateRandomString(length) {
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

function generateStorageData(data, name) {
  const now = new Date().toISOString();
  return {
    client: "SealDice",
    created_at: now,
    data: data,
    name: name,
    note: "",
    updated_at: now,
  };
}

/**
 * Get the log retention days from environment or config
 * @param {object} env - The environment variables object
 * @returns {number} The number of days to retain logs
 */
function getLogRetentionDays(env) {
  const runtimeVar =
    (typeof globalThis !== 'undefined' && globalThis.LOG_RETENTION_DAYS) ||
    (typeof process !== 'undefined' && process.env && process.env.LOG_RETENTION_DAYS);
  
  if (runtimeVar) {
    const days = parseInt(runtimeVar, 10);
    return isNaN(days) ? 30 : Math.max(days, 1); // Minimum 1 day
  }
  
  if (env && env.LOG_RETENTION_DAYS) {
    const days = parseInt(env.LOG_RETENTION_DAYS, 10);
    return isNaN(days) ? 30 : Math.max(days, 1);
  }
  
  if (typeof CFG_LOG_RETENTION_DAYS !== 'undefined' && CFG_LOG_RETENTION_DAYS) {
    return Math.max(CFG_LOG_RETENTION_DAYS, 1);
  }
  
  return 30; // Default to 30 days
}

/**
 * Clean up old logs that exceed the retention period
 * @param {object} kvStorage - The KV storage object (XBSKV)
 * @param {number} retentionDays - Number of days to keep logs
 * @returns {Promise<object>} Summary of deleted logs
 */
async function cleanupOldLogs(kvStorage, retentionDays) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  let deletedCount = 0;
  let processedCount = 0;
  
  try {
    // List all keys in KV storage with pagination
    let result;
    let cursor;
    do {
      result = await kvStorage.list({ cursor });
      
      if (!result || !result.keys) {
        console.log('Cleanup: No keys found');
        break;
      }
      
      // Iterate through keys in current page
      for (const keyObj of result.keys) {
        const key = keyObj.key;
        processedCount++;
        
        try {
          // Get the stored data
          const storedDataStr = await kvStorage.get(key);
          
          if (storedDataStr) {
            const storedData = JSON.parse(storedDataStr);
            
            // Check if the log was created before the cutoff date
            if (storedData.created_at && new Date(storedData.created_at) < cutoffDate) {
              // Delete the old log
              await kvStorage.delete(key);
              deletedCount++;
              console.log(`Cleanup: Deleted old log key: ${key}`);
            }
          }
        } catch (err) {
          console.log(`Cleanup: Error processing key ${key}: ${err.message}`);
          // Continue with next key even if one fails
        }
      }
      
      cursor = result.cursor;
    } while (result && !result.complete);
    
  } catch (err) {
    console.error(`Cleanup: Error during cleanup process: ${err.message}`);
    // Return partial results - cleanup failure shouldn't block the upload
  }
  
  return { deletedCount, processedCount, retentionDays };
}

/**
 * Quick cleanup with timeout - deletes oldest logs up to 5 second timeout
 * Used when KV storage is full to make room for new uploads
 * @param {object} kvStorage - The KV storage object (XBSKV)
 * @param {number} timeoutMs - Timeout in milliseconds (default 5000ms)
 * @returns {Promise<object>} Summary of deleted logs
 */
async function cleanupOldLogsQuick(kvStorage, timeoutMs = 5000) {
  let deletedCount = 0;
  let processedCount = 0;
  const startTime = Date.now();
  
  try {
    // List all keys in KV storage with pagination
    const keysWithData = [];
    let result;
    let cursor;
    
    do {
      if (Date.now() - startTime > timeoutMs) {
        console.log(`QuickCleanup: Timeout reached after collecting ${processedCount} keys`);
        break;
      }
      
      result = await kvStorage.list({ cursor });
      
      if (!result || !result.keys) {
        console.log('QuickCleanup: No keys found');
        break;
      }
      
      // Collect keys with their creation dates
      for (const keyObj of result.keys) {
        if (Date.now() - startTime > timeoutMs) {
          console.log(`QuickCleanup: Timeout reached after processing ${processedCount} keys`);
          break;
        }
        
        const key = keyObj.key;
        processedCount++;
        
        try {
          const storedDataStr = await kvStorage.get(key);
          if (storedDataStr) {
            const storedData = JSON.parse(storedDataStr);
            keysWithData.push({
              key,
              createdAt: new Date(storedData.created_at || Date.now())
            });
          }
        } catch (err) {
          console.log(`QuickCleanup: Error processing key ${key}: ${err.message}`);
        }
      }
      
      cursor = result.cursor;
    } while (result && !result.complete && Date.now() - startTime < timeoutMs);
    
    // Sort by created_at (oldest first) and delete oldest entries
    keysWithData.sort((a, b) => a.createdAt - b.createdAt);
    
    // Delete oldest logs until timeout
    for (const {key} of keysWithData) {
      if (Date.now() - startTime > timeoutMs) {
        console.log(`QuickCleanup: Timeout reached, deleted ${deletedCount} logs`);
        break;
      }
      
      try {
        await kvStorage.delete(key);
        deletedCount++;
        console.log(`QuickCleanup: Deleted old log key: ${key}`);
      } catch (err) {
        console.log(`QuickCleanup: Error deleting key ${key}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`QuickCleanup: Error during quick cleanup: ${err.message}`);
  }
  
  return { deletedCount, processedCount, timeoutMs };
}

function normalize(url) {
  if (typeof url !== 'string' || !url) {
    throw new Error('未配置前端地址参数 FRONTEND_URL ，请设置运行时的变量 FRONTEND_URL。FRONTEND_URL is not configured. Please set runtime variable FRONTEND_URL.');
  }
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return withProtocol.replace(/\/+$/, '/');
}
import { FRONTEND_URL as CFG_URL, LOG_RETENTION_DAYS as CFG_LOG_RETENTION_DAYS } from '../../../config/appConfig.js';
async function resolveFrontendUrl(env) {
  const runtimeVar =
    (typeof globalThis !== 'undefined' && globalThis.FRONTEND_URL) ||
    (typeof process !== 'undefined' && process.env && process.env.FRONTEND_URL);
  if (runtimeVar) return normalize(runtimeVar);
  if (env && env.FRONTEND_URL) return normalize(env.FRONTEND_URL);
  if (typeof CFG_URL !== 'undefined' && CFG_URL) return normalize(CFG_URL);
  throw new Error('未配置前端地址参数FRONTEND_URL，请设置运行时的变量或编辑 config/appConfig.js 添加用于导出前端地址的参数 FRONTEND_URL。FRONTEND_URL is not configured. Please set runtime variable FRONTEND_URL or edit config/appConfig.js to export FRONTEND_URL.');
}
const FILE_SIZE_LIMIT_MB = 5;

const getCorsHeaders = (frontendUrl, methods = 'GET, PUT, OPTIONS') => ({
  'Access-Control-Allow-Origin': frontendUrl.slice(0, -1),
  'Access-Control-Allow-Methods': methods,
  'Access-Control-Allow-Headers': 'Content-Type, Accept-Version',
});

/**
 * EdgeOne Pages Function handler
 * @param {object} context - The function context.
 * @param {Request} context.request - The incoming request.
 */
export async function onRequest({ request, env }) {
  const { pathname, searchParams } = new URL(request.url);

  // Log all requests for debugging
  console.log(`[DEBUG] Request: ${request.method} ${pathname}`);

  let FRONTEND_URL;
  try {
    FRONTEND_URL = await resolveFrontendUrl(env);
  } catch (e) {
    const msg = (e && e.message) ? e.message : '未配置前端地址参数FRONTEND_URL，请设置运行时的变量或编辑 config/appConfig.js 添加用于导出前端地址的参数FRONTEND_URL。FRONTEND_URL is not configured. Please set runtime variable FRONTEND_URL or edit config/appConfig.js.';
    return new Response(msg, { status: 500 });
  }
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(FRONTEND_URL) });
  }

  // Check for KV binding in the global scope
  if (typeof XBSKV === 'undefined') {
    return new Response('严重错误：API服务找不到全局KV绑定"XBSKV"。请向日志站维护者反馈修正 EdgeOne Pages 配置。CRITICAL ERROR: Global KV Binding "XBSKV" not found. Please verify EdgeOne Pages configuration.', { status: 500 });
  }

  // --- Route 1: Upload Log ---
  if ((pathname === '/api/dice/log' || pathname.endsWith('/api/dice/log')) && request.method === 'PUT') {
    console.log('[ROUTE] Matched: Upload Log');
    try {
      const contentLength = request.headers.get('Content-Length');
      if (contentLength && parseInt(contentLength, 10) > FILE_SIZE_LIMIT_MB * 1024 * 1024) {
        return new Response(
          JSON.stringify({ success: false, message: `File size exceeds ${FILE_SIZE_LIMIT_MB}MB limit` }),
          { status: 413, headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, OPTIONS'), 'Content-Type': 'application/json' } }
        );
      }

      const formData = await request.formData();
      const name = formData.get("name");
      const file = formData.get("file");
      const uniform_id = formData.get("uniform_id");

      if (!/^[^:]+:\d+$/.test(uniform_id)) {
        return new Response(
          JSON.stringify({ data: "uniform_id field did not pass validation" }),
          { status: 400, headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, OPTIONS'), 'Content-Type': 'application/json' } }
        );
      }

      if (file.size > FILE_SIZE_LIMIT_MB * 1024 * 1024) {
        return new Response(
          JSON.stringify({ data: "Size is too big!" }),
          { status: 413, headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, OPTIONS'), 'Content-Type': 'application/json' } }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binaryString = '';
      uint8Array.forEach((byte) => { binaryString += String.fromCharCode(byte); });
      const logdata = btoa(binaryString);

      const password = Math.floor(Math.random() * (999999 - 100000 + 1) + 100000);
      const key = generateRandomString(4);
      const storageKey = `${key}#${password}`;
      const logContent = JSON.stringify(generateStorageData(logdata, name));

      // Try to upload the log
      let uploadSuccess = false;
      const retentionDays = getLogRetentionDays(env);
      
      try {
        // Attempt first upload
        await XBSKV.put(storageKey, logContent);
        uploadSuccess = true;
        console.log(`Upload: Successfully saved log with key: ${storageKey}`);
      } catch (uploadError) {
        // Check if the error is due to KV storage limit
        if (uploadError.message && uploadError.message.includes('limit exceeded')) {
          console.log('Upload: KV storage limit exceeded, executing quick cleanup...');
          
          try {
            // Quick cleanup with 5 second timeout
            const cleanupResult = await cleanupOldLogsQuick(XBSKV, 5000);
            console.log(`Upload: Quick cleanup completed - deleted ${cleanupResult.deletedCount} logs`);
            
            // Retry upload after cleanup
            await XBSKV.put(storageKey, logContent);
            uploadSuccess = true;
            console.log(`Upload: Successfully saved log after cleanup with key: ${storageKey}`);
          } catch (retryError) {
            console.error('Upload: Failed to upload after cleanup attempt:', retryError.message);
            throw retryError;
          }
        } else {
          // Not a storage limit error, re-throw
          throw uploadError;
        }
      }

      // Continue with background cleanup for expired logs
      // This runs asynchronously and doesn't block the response
      if (uploadSuccess) {
        cleanupOldLogs(XBSKV, retentionDays)
          .then(result => {
            if (result.deletedCount > 0) {
              console.log(`Background cleanup: deleted ${result.deletedCount} logs older than ${result.retentionDays} days`);
            }
          })
          .catch(err => {
            console.error(`Background cleanup failed (non-critical): ${err.message}`);
          });
      }

      const responsePayload = { url: `${FRONTEND_URL}?key=${key}#${password}` };

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, OPTIONS'), 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('Upload error:', error);
      return new Response(error.stack || 'Internal Server Error', { status: 500 });
    }
  }

  // --- Route 2: Load Log Data ---
  if ((pathname === '/api/dice/load_data' || pathname.endsWith('/api/dice/load_data')) && request.method === 'GET') {
    console.log('[ROUTE] Matched: Load Log Data');
    try {
      const key = searchParams.get("key");
      const password = searchParams.get("password");

      if (!key || !password) {
        return new Response(JSON.stringify({ error: "Missing key or password" }), {
          status: 400,
          headers: { ...getCorsHeaders(FRONTEND_URL, 'GET, OPTIONS'), 'Content-Type': 'application/json' },
        });
      }

      const storageKey = `${key}#${password}`;
      
      // Use the global XBSKV variable
      const storedData = await XBSKV.get(storageKey);

      if (storedData === null) {
        return new Response(JSON.stringify({ error: "Data not found" }), {
          status: 404,
          headers: { ...getCorsHeaders(FRONTEND_URL, 'GET, OPTIONS'), 'Content-Type': 'application/json' },
        });
      }

      return new Response(storedData, {
        status: 200,
        headers: { ...getCorsHeaders(FRONTEND_URL, 'GET, OPTIONS'), 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('Load data error:', error);
      return new Response(error.stack || '服务器错误 Internal Server Error', { status: 500 });
    }
  }

  // --- Fallback: Not Found ---
  console.log(`[FALLBACK] No route matched for: ${request.method} ${pathname}`);
  return new Response('访问的API接口不存在或方式错误，检查API设置是否正确', { status: 404 });
}
