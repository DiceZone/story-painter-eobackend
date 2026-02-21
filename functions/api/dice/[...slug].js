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
 * @returns {Promise<object>} Summary of deleted logs with execution logs
 */
async function cleanupOldLogs(kvStorage, retentionDays) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  let deletedCount = 0;
  let processedCount = 0;
  const logs = [];
  
  const addLog = (msg) => {
    const logEntry = `[${new Date().toISOString()}] ${msg}`;
    logs.push(logEntry);
    console.log(logEntry);
  };
  
  try {
    addLog(`Starting cleanup with retention: ${retentionDays} days, cutoff: ${cutoffDate.toISOString()}`);
    
    // List all keys in KV storage with pagination
    let result;
    let cursor;
    let pageCount = 0;
    
    do {
      addLog(`Fetching page ${pageCount + 1} (cursor: ${cursor || 'null'})...`);
      result = await kvStorage.list({ cursor, limit: 256 });
      pageCount++;
      
      addLog(`Page ${pageCount}: hasResult=${!!result}, hasKeys=${!!result?.keys}, keysLength=${result?.keys?.length || 0}, complete=${result?.complete}`);
      
      if (!result || !result.keys) {
        addLog(`No keys found on page ${pageCount}, breaking`);
        break;
      }
      
      if (result.keys.length === 0) {
        addLog(`Keys array is empty on page ${pageCount}`);
        if (result.complete) {
          addLog(`List is complete`);
          break;
        }
      }
      
      // Iterate through keys in current page
      addLog(`Processing ${result.keys.length} keys on page ${pageCount}`);
      for (const keyObj of result.keys) {
        const key = keyObj.key;
        processedCount++;
        
        try {
          // Get the stored data
          const storedDataStr = await kvStorage.get(key);
          
          if (storedDataStr) {
            const storedData = JSON.parse(storedDataStr);
            const createdAt = new Date(storedData.created_at);
            
            // Check if the log was created before the cutoff date
            if (createdAt < cutoffDate) {
              // Delete the old log
              await kvStorage.delete(key);
              deletedCount++;
              addLog(`DELETED: key=${key}, created=${createdAt.toISOString()}`);
            } else {
              addLog(`KEPT: key=${key}, created=${createdAt.toISOString()} (within retention)`);
            }
          } else {
            addLog(`EMPTY: key=${key} has no data`);
          }
        } catch (err) {
          addLog(`ERROR processing key ${key}: ${err.message}`);
        }
      }
      
      cursor = result.cursor;
      addLog(`End of page ${pageCount}: complete=${result.complete}, nextCursor=${cursor || 'null'}`);
    } while (result && !result.complete && cursor);
    
    addLog(`Completed processing ${pageCount} pages, total keys processed=${processedCount}, deleted=${deletedCount}`);
    
  } catch (err) {
    addLog(`CRITICAL ERROR: ${err.message}`);
    addLog(`Error stack: ${err.stack}`);
  }
  
  return { deletedCount, processedCount, retentionDays, logs };
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
    console.log(`QuickCleanup: Starting quick cleanup with ${timeoutMs}ms timeout`);
    
    // List all keys in KV storage with pagination
    const keysWithData = [];
    let result;
    let cursor;
    let pageCount = 0;
    
    do {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > timeoutMs) {
        console.log(`QuickCleanup: Timeout reached (${elapsedTime}ms) after collecting keys from ${pageCount} pages`);
        break;
      }
      
      console.log(`QuickCleanup: Fetching page ${pageCount + 1}...`);
      result = await kvStorage.list({ cursor, limit: 256 });
      pageCount++;
      
      if (!result || !result.keys || result.keys.length === 0) {
        console.log(`QuickCleanup: No keys found on page ${pageCount}`);
        if (!result || result.complete) break;
      } else {
        console.log(`QuickCleanup: Found ${result.keys.length} keys on page ${pageCount}`);
      }
      
      // Collect keys with their creation dates
      for (const keyObj of (result?.keys || [])) {
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > timeoutMs) {
          console.log(`QuickCleanup: Timeout reached while processing keys`);
          break;
        }
        
        const key = keyObj.key;
        processedCount++;
        
        try {
          const storedDataStr = await kvStorage.get(key);
          if (storedDataStr) {
            const storedData = typeof storedDataStr === 'string' ? JSON.parse(storedDataStr) : storedDataStr;
            keysWithData.push({
              key,
              createdAt: new Date(storedData.created_at || Date.now())
            });
          }
        } catch (err) {
          console.log(`QuickCleanup: Error processing key ${key}: ${err.message}`);
        }
      }
      
      cursor = result?.cursor;
      if (!result || result.complete) {
        console.log(`QuickCleanup: List complete`);
        break;
      }
    } while (cursor && Date.now() - startTime < timeoutMs);
    
    console.log(`QuickCleanup: Collected ${keysWithData.length} keys to evaluate`);
    
    // Sort by created_at (oldest first) and delete oldest entries
    keysWithData.sort((a, b) => a.createdAt - b.createdAt);
    
    console.log(`QuickCleanup: Starting deletion of old keys...`);
    
    // Delete oldest logs until timeout
    for (const {key, createdAt} of keysWithData) {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > timeoutMs) {
        console.log(`QuickCleanup: Timeout reached after deleting ${deletedCount} logs`);
        break;
      }
      
      try {
        await kvStorage.delete(key);
        deletedCount++;
        console.log(`QuickCleanup: Deleted key: ${key} (created: ${createdAt.toISOString()})`);
      } catch (err) {
        console.log(`QuickCleanup: Error deleting key ${key}: ${err.message}`);
      }
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`QuickCleanup: Completed in ${totalTime}ms - deleted ${deletedCount}/${keysWithData.length} keys`);
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
        // Better error logging
        const errorMsg = String(uploadError?.message || uploadError?.toString() || 'Unknown error');
        const errorStr = JSON.stringify(uploadError, null, 2);
        console.error(`Upload Error Details:`, errorStr);
        console.error(`Upload Error Message: ${errorMsg}`);
        
        // Check if the error is due to KV storage limit
        if (errorMsg.includes('limit exceeded') || errorMsg.includes('quota') || errorMsg.includes('exceeded')) {
          console.log('Upload: KV storage limit exceeded, executing quick cleanup...');
          
          try {
            // Quick cleanup with 5 second timeout
            const cleanupResult = await cleanupOldLogsQuick(XBSKV, 5000);
            console.log(`Upload: Quick cleanup completed - deleted ${cleanupResult.deletedCount} logs, processed ${cleanupResult.processedCount}`);
            
            // Wait a moment before retrying
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Retry upload after cleanup
            await XBSKV.put(storageKey, logContent);
            uploadSuccess = true;
            console.log(`Upload: Successfully saved log after cleanup with key: ${storageKey}`);
          } catch (retryError) {
            const retryMsg = String(retryError?.message || retryError?.toString() || 'Unknown error');
            console.error('Upload: Failed to upload after cleanup attempt:', retryMsg);
            throw new Error(`Upload failed even after cleanup: ${retryMsg}`);
          }
        } else {
          // Not a storage limit error, re-throw
          console.error('Upload: Non-storage error, re-throwing:', errorMsg);
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

  // --- Route 2: Cleanup Logs ---
  if ((pathname === '/api/dice/cleanup' || pathname.endsWith('/api/dice/cleanup')) && (request.method === 'GET' || request.method === 'POST')) {
    console.log('[ROUTE] Matched: Cleanup Logs');
    try {
      const retentionDays = getLogRetentionDays(env);
      
      const cleanupResult = await cleanupOldLogs(XBSKV, retentionDays);
      
      const responsePayload = {
        success: true,
        message: `Cleanup completed: deleted ${cleanupResult.deletedCount} logs out of ${cleanupResult.processedCount} processed`,
        deletedCount: cleanupResult.deletedCount,
        processedCount: cleanupResult.processedCount,
        retentionDays: cleanupResult.retentionDays,
        timestamp: new Date().toISOString(),
        logs: cleanupResult.logs || []
      };
      
      return new Response(JSON.stringify(responsePayload, null, 2), {
        status: 200,
        headers: { ...getCorsHeaders(FRONTEND_URL, 'GET, POST, OPTIONS'), 'Content-Type': 'application/json' },
      });
    } catch (error) {
      const errorResponse = {
        success: false,
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
        stack: error.stack
      };
      return new Response(JSON.stringify(errorResponse, null, 2), {
        status: 500,
        headers: { ...getCorsHeaders(FRONTEND_URL, 'GET, POST, OPTIONS'), 'Content-Type': 'application/json' },
      });
    }
  }

  // --- Route 3: Load Log Data ---
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
