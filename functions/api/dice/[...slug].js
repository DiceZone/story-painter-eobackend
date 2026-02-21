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

const INDEX_KEY = '0Aindex';

/**
 * Read the index table from KV storage
 * @param {object} kvStorage - The KV storage object (XBSKV)
 * @returns {Promise<object>} Index table object with logs array
 */
async function getIndexTable(kvStorage) {
  try {
    const indexStr = await kvStorage.get(INDEX_KEY);
    if (!indexStr) {
      return { version: 1, lastUpdated: new Date().toISOString(), logs: [] };
    }
    return JSON.parse(indexStr);
  } catch (err) {
    console.log(`getIndexTable: Error reading index, returning empty: ${err.message}`);
    return { version: 1, lastUpdated: new Date().toISOString(), logs: [] };
  }
}

/**
 * Update the index table with a new log entry (read-modify-write with version check)
 * @param {object} kvStorage - The KV storage object (XBSKV)
 * @param {string} key - The storage key of the new log
 * @returns {Promise<void>}
 */
async function addToIndexTable(kvStorage, key) {
  const maxRetries = 3;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const index = await getIndexTable(kvStorage);
      const newEntry = {
        key: key,
        created_at: new Date().toISOString()
      };
      
      console.log(`addToIndexTable: Current index has ${index.logs.length} entries before adding`);
      
      // Avoid duplicates
      if (index.logs.some(log => log.key === key)) {
        console.log(`addToIndexTable: ${key} already exists in index`);
        return;
      }
      
      index.logs.push(newEntry);
      index.lastUpdated = new Date().toISOString();
      
      console.log(`addToIndexTable: Index now has ${index.logs.length} entries after adding. New entry: key=${key}, created_at=${newEntry.created_at}`);
      
      // Try to write the updated index
      await kvStorage.put(INDEX_KEY, JSON.stringify(index));
      console.log(`addToIndexTable: Successfully wrote updated index to KV`);
      return;  // Success
      
    } catch (err) {
      retries++;
      console.error(`addToIndexTable: Error updating index (attempt ${retries}/${maxRetries}): ${err.message}`);
      
      if (retries < maxRetries) {
        // Wait a bit before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 100 * retries));
      } else {
        // Give up after max retries
        throw new Error(`Failed to add to index after ${maxRetries} attempts: ${err.message}`);
      }
    }
  }
}

/**
 * Clean up old logs based on index table
 * @param {object} kvStorage - The KV storage object (XBSKV)
 * @param {number} retentionDays - Number of days to keep logs
 * @returns {Promise<object>} Summary of deleted logs with execution logs
 */
async function cleanupOldLogsViaIndex(kvStorage, retentionDays) {
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
    addLog(`Starting cleanup via index with retention: ${retentionDays} days, cutoff: ${cutoffDate.toISOString()}`);
    
    // Get the index table
    const index = await getIndexTable(kvStorage);
    addLog(`Index has ${index.logs.length} entries`);
    
    if (!index.logs || index.logs.length === 0) {
      addLog('Index is empty, nothing to cleanup');
      return { deletedCount: 0, processedCount: 0, retentionDays, logs };
    }
    
    const keysToDelete = [];
    let keptCount = 0;
    
    // Iterate through index entries and identify old ones
    for (const logEntry of index.logs) {
      processedCount++;
      const createdAt = new Date(logEntry.created_at);
      
      if (createdAt < cutoffDate) {
        keysToDelete.push(logEntry.key);
      } else {
        keptCount++;
      }
    }
    
    addLog(`Analysis complete: ${keysToDelete.length} logs to delete, ${keptCount} logs to keep (within ${retentionDays} day retention)`);
    
    if (keysToDelete.length === 0) {
      addLog('No old logs found to delete');
      return { deletedCount: 0, processedCount, retentionDays, logs };
    }
    
    // Delete the old logs from KV storage
    for (const key of keysToDelete) {
      try {
        await kvStorage.delete(key);
        deletedCount++;
        addLog(`Deleted from KV: ${key}`);
      } catch (err) {
        addLog(`ERROR deleting ${key} from KV: ${err.message}`);
      }
    }
    
    addLog(`Deleted ${deletedCount} logs from KV storage`);
    
    // Update the index table - read fresh copy before writing
    if (deletedCount > 0) {
      let updateSuccess = false;
      let retries = 0;
      const maxRetries = 3;
      
      while (retries < maxRetries && !updateSuccess) {
        try {
          // Read a fresh copy of the index (might have new uploads since we started cleanup)
          const freshIndex = await getIndexTable(kvStorage);
          addLog(`Cleanup index update (attempt ${retries + 1}): fetched fresh index with ${freshIndex.logs.length} entries`);
          
          // Remove only the IDs we deleted from KV, keep everything else (including new uploads)
          const updatedIndex = {
            ...freshIndex,
            logs: freshIndex.logs.filter(log => !keysToDelete.includes(log.key)),
            lastUpdated: new Date().toISOString()
          };
          
          await kvStorage.put(INDEX_KEY, JSON.stringify(updatedIndex));
          updateSuccess = true;
          
          addLog(`Index updated: removed ${keysToDelete.length} old entries, index now has ${updatedIndex.logs.length} entries`);
          
        } catch (err) {
          retries++;
          addLog(`WARNING: Failed to update index (attempt ${retries}/${maxRetries}): ${err.message}`);
          if (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 100 * retries));
          }
        }
      }
      
      if (!updateSuccess) {
        addLog(`ERROR: Could not update index table after ${maxRetries} attempts - cleanup incomplete`);
      }
    }
    
    addLog(`Cleanup completed: deleted ${deletedCount} logs from KV storage and index`);
    
  } catch (err) {
    addLog(`CRITICAL ERROR: ${err.message}`);
    addLog(`Error stack: ${err.stack}`);
  }
  
  return { deletedCount, processedCount, retentionDays, logs };
}





function normalize(url) {
  if (typeof url !== 'string' || !url) {
    throw new Error('未配置前端地址参数 FRONTEND_URL ，请设置运行时的变量 FRONTEND_URL。FRONTEND_URL is not configured. Please set runtime variable FRONTEND_URL.');
  }
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return withProtocol.replace(/\/+$/, '/');
}

function normalizeBackupApi(url) {
  if (typeof url !== 'string' || !url) {
    return null;  // Backup API is optional
  }
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return withProtocol.replace(/\/+$/, '/');
}

import { FRONTEND_URL as CFG_URL, LOG_RETENTION_DAYS as CFG_LOG_RETENTION_DAYS, BACKUP_UPLOAD_API as CFG_BACKUP_UPLOAD_API } from '../../../config/appConfig.js';

async function resolveFrontendUrl(env) {
  const runtimeVar =
    (typeof globalThis !== 'undefined' && globalThis.FRONTEND_URL) ||
    (typeof process !== 'undefined' && process.env && process.env.FRONTEND_URL);
  if (runtimeVar) return normalize(runtimeVar);
  if (env && env.FRONTEND_URL) return normalize(env.FRONTEND_URL);
  if (typeof CFG_URL !== 'undefined' && CFG_URL) return normalize(CFG_URL);
  throw new Error('未配置前端地址参数FRONTEND_URL，请设置运行时的变量或编辑 config/appConfig.js 添加用于导出前端地址的参数 FRONTEND_URL。FRONTEND_URL is not configured. Please set runtime variable FRONTEND_URL or edit config/appConfig.js to export FRONTEND_URL.');
}

async function resolveBackupApi(env) {
  const runtimeVar =
    (typeof globalThis !== 'undefined' && globalThis.BACKUP_UPLOAD_API) ||
    (typeof process !== 'undefined' && process.env && process.env.BACKUP_UPLOAD_API);
  if (runtimeVar) return normalizeBackupApi(runtimeVar);
  if (env && env.BACKUP_UPLOAD_API) return normalizeBackupApi(env.BACKUP_UPLOAD_API);
  if (typeof CFG_BACKUP_UPLOAD_API !== 'undefined' && CFG_BACKUP_UPLOAD_API) return normalizeBackupApi(CFG_BACKUP_UPLOAD_API);
  return null;  // Backup API is optional
}
const FILE_SIZE_LIMIT_MB = 5;

/**
 * Upload log to backup API endpoint
 * @param {string} backupApiUrl - The backup API endpoint URL
 * @param {string} uniform_id - The uniform ID from the request
 * @param {string} name - The log name
 * @param {File} file - The original file object
 * @returns {Promise<object>} Response from backup API
 */
async function uploadToBackupApi(backupApiUrl, uniform_id, name, file) {
  // Send as FormData to backup API - use the same format as main API expects
  const formData = new FormData();
  formData.append('uniform_id', uniform_id);
  formData.append('name', name);
  formData.append('file', file);

  // Manually set Content-Type header for EdgeOne Pages compatibility
  const boundary = '----FormBoundary' + Math.random().toString(36).substr(2, 9);
  const headers = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`
  };

  const response = await fetch(backupApiUrl, {
    method: 'PUT',
    body: formData,
    headers: headers
  });

    const errorText = await response.text();
    throw new Error(`Backup API URL ${backupApiUrl} returned status ${response.status}: ${errorText}`);
  }

  return await response.json();
}

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
      let uploadedToBackup = false;
      const retentionDays = getLogRetentionDays(env);
      const backupApiUrl = await resolveBackupApi(env);
      console.log(`Upload: Backup API URL resolved to: ${backupApiUrl || 'null (not configured)'}`);
      
      try {
        // Attempt upload
        await XBSKV.put(storageKey, logContent);
        uploadSuccess = true;
        console.log(`Upload: Successfully saved log with key: ${storageKey}`);
        
        // Synchronously add to index table immediately after successful upload
        // This must complete before returning response or starting cleanup
        await addToIndexTable(XBSKV, storageKey);
        console.log(`Upload: Added to index table successfully`);
        
        // Verify the new entry is actually in the index (before returning to user)
        const verifyIndex = await getIndexTable(XBSKV);
        console.log(`Upload: Verification - index has ${verifyIndex.logs.length} entries`);
        const newEntryInIndex = verifyIndex.logs.find(log => log.key === storageKey);
        const isInIndex = !!newEntryInIndex;
        if (!isInIndex) {
          throw new Error(`Index verification failed: new entry not found in index after addition`);
        }
        console.log(`Upload: Index verification passed - new entry confirmed: key=${storageKey}, created_at=${newEntryInIndex.created_at}`);
        
      } catch (uploadError) {
        // Better error logging
        const errorMsg = String(uploadError?.message || uploadError?.toString() || 'Unknown error');
        const errorStr = JSON.stringify(uploadError, null, 2);
        console.error(`Upload Error - KV.put failed:`, errorStr);
        console.error(`Upload Error Message: ${errorMsg}`);
        
        // KV upload failed, try backup API if available
        if (backupApiUrl) {
          console.log(`Upload: KV storage failed, attempting backup API at ${backupApiUrl}...`);
          try {
            const backupResult = await uploadToBackupApi(backupApiUrl, uniform_id, name, file);
            console.log(`Upload: Successfully uploaded to backup API:`, backupResult);
            uploadedToBackup = true;
            
            // Return backup API's response directly to client
            return new Response(JSON.stringify(backupResult), {
              status: 202,  // 202 Accepted - backup upload
              headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, OPTIONS'), 'Content-Type': 'application/json' },
            });
          } catch (backupErr) {
            const backupMsg = String(backupErr?.message || backupErr?.toString() || 'Unknown error');
            console.error('Upload: Backup API also failed:', backupMsg);
            
            // Both KV and backup API failed - return error with both messages
            const fullErrorMsg = `KV storage error: ${errorMsg}\n\nBackup API error: ${backupMsg}`;
            return new Response(fullErrorMsg, { status: 500 });
          }
        } else {
          // No backup API configured and KV failed
          console.log('Upload: KV storage failed and no backup API configured');
          const fullErrorMsg = `KV storage error: ${errorMsg}\n\nNo backup API configured`;
          return new Response(fullErrorMsg, { status: 500 });
        }
      }

      // Continue with background cleanup for expired logs (async, doesn't block)
      if (uploadSuccess) {
        cleanupOldLogsViaIndex(XBSKV, retentionDays)
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
      
      const cleanupResult = await cleanupOldLogsViaIndex(XBSKV, retentionDays);
      
      const responsePayload = {
        success: true,
        message: `Cleanup completed: deleted ${cleanupResult.deletedCount} logs out of ${cleanupResult.processedCount} total`,
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
      
      // Prevent access to the index table
      if (storageKey === INDEX_KEY) {
        return new Response(JSON.stringify({ error: "Access denied: This is an internal index table" }), {
          status: 403,
          headers: { ...getCorsHeaders(FRONTEND_URL, 'GET, OPTIONS'), 'Content-Type': 'application/json' },
        });
      }
      
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
