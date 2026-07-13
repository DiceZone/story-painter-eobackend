import { zlibSync } from 'fflate';

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

function generateStorageData(data, name, client = "SealDice") {
  const now = new Date().toISOString();
  return {
    client: client,
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
 * @param {object} kvStorage - The KV storage object (storage)
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
 * @param {object} kvStorage - The KV storage object (storage)
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
 * @param {object} kvStorage - The KV storage object (storage)
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
 * @param {string} logdata - Base64 encoded log data
 * @param {string[]} visitedHosts - Array of previously visited hosts to prevent circular references
 * @returns {Promise<object>} Response from backup API
 */
async function uploadToBackupApi(backupApiUrl, uniform_id, name, logdata, visitedHosts = []) {
  // Check for circular reference
  const backupHost = new URL(backupApiUrl).host;
  if (visitedHosts.includes(backupHost)) {
    throw new Error(`Circular reference detected: ${backupHost} has already been visited in the backup chain`);
  }

  // Send as JSON to backup API
  const payload = {
    uniform_id,
    name,
    logdata,
    visitedHosts: [...visitedHosts, backupHost] // Include current host in the chain
  };
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
  
  try {
    const response = await fetch(backupApiUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    let responseBody;
    try {
      responseBody = await response.text();
    } catch (e) {
      responseBody = '';
    }
    
    if (!response.ok) {
      throw new Error(`Backup API URL ${backupApiUrl} returned status ${response.status}: ${responseBody}`);
    }
    
    // Try to parse as JSON, if it fails just return the text
    try {
      return JSON.parse(responseBody);
    } catch (e) {
      return { url: responseBody };
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Backup API ${backupApiUrl} timeout after 5 seconds`);
    }
    throw err;
  }
}

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
// 核心路由处理：与存储后端解耦。storage 需实现 get(key)/put(key,value)/delete(key)。
// EdgeOne(全局storage) 与本地 server.js(SQLite/S3/COS) 共用此函数。
export async function handleDiceRequest(request, storage, env) {
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
      // 透传上传方声明的客户端类型（SealDice=zlib JSON / Parquet=parquet / DiceNext=zstd JSON）。
      // 染色器据此选择解码方式；缺省 SealDice 兼容旧客户端。
      const client = formData.get("client") || "SealDice";

      if (!/^[^:]+:[A-Za-z0-9_\-\.]+$/.test(uniform_id)) {
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
      const logContent = JSON.stringify(generateStorageData(logdata, name, client));

      // Try to upload the log
      let uploadSuccess = false;
      let uploadedToBackup = false;
      const retentionDays = getLogRetentionDays(env);
      const backupApiUrl = await resolveBackupApi(env);
      console.log(`Upload: Backup API URL resolved to: ${backupApiUrl || 'null (not configured)'}`);
      
      try {
        // Attempt upload
        await storage.put(storageKey, logContent);
        uploadSuccess = true;
        console.log(`Upload: Successfully saved log with key: ${storageKey}`);
        
        // Synchronously add to index table immediately after successful upload
        // This must complete before returning response or starting cleanup
        await addToIndexTable(storage, storageKey);
        console.log(`Upload: Added to index table successfully`);
        
        // Verify the new entry is actually in the index (before returning to user)
        const verifyIndex = await getIndexTable(storage);
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
        
        // KV upload failed, try backup upload bridge if available
        const backupApiUrl = await resolveBackupApi(env);
        if (backupApiUrl) {
          console.log(`Upload: KV storage failed, attempting backup API via bridge at ${backupApiUrl}...`);
          try {
            const currentHost = new URL(request.url).host;
            const backupResult = await uploadToBackupApi(backupApiUrl, uniform_id, name, logdata, [currentHost]);
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
        cleanupOldLogsViaIndex(storage, retentionDays)
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
      
      const cleanupResult = await cleanupOldLogsViaIndex(storage, retentionDays);
      
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
      
      // Use the global storage variable
      const storedData = await storage.get(storageKey);

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

  // --- Route 4: Backup Upload ---
  if ((pathname === '/api/dice/backup-upload' || pathname.endsWith('/api/dice/backup-upload')) && request.method === 'PUT') {
    console.log('[ROUTE] Matched: Backup Upload');
    try {
      const contentLength = request.headers.get('Content-Length');
      if (contentLength && parseInt(contentLength, 10) > FILE_SIZE_LIMIT_MB * 1024 * 1024) {
        return new Response(
          JSON.stringify({ success: false, message: `File size exceeds ${FILE_SIZE_LIMIT_MB}MB limit` }),
          { status: 413, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Parse JSON from request body
      const body = await request.json();
      const name = body.name;
      const logdata = body.logdata;
      const uniform_id = body.uniform_id;

      if (!uniform_id || !name || !logdata) {
        return new Response(
          JSON.stringify({ success: false, message: "Missing required fields: uniform_id, name, or logdata" }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (!/^[^:]+:[A-Za-z0-9_\-\.]+$/.test(uniform_id)) {
        return new Response(
          JSON.stringify({ data: "uniform_id field did not pass validation" }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const retentionDays = getLogRetentionDays(env);
      const password = Math.floor(Math.random() * (999999 - 100000 + 1) + 100000);
      const key = generateRandomString(4);
      const storageKey = `${key}#${password}`;
      let backupUploadSuccess = false;
      const backupLogContent = JSON.stringify({
        client: "SealDice",
        created_at: new Date().toISOString(),
        data: logdata,
        name: name,
        note: "Backup upload",
        updated_at: new Date().toISOString(),
      });

      try {
        // Try to store in own KV
        await storage.put(storageKey, backupLogContent);
        console.log(`Backup Upload: Successfully saved with key: ${storageKey}`);

        // Add to index table
        await addToIndexTable(storage, storageKey);
        console.log(`Backup Upload: Added to index table successfully`);
        backupUploadSuccess = true;

        // Continue with background cleanup for expired logs (async, doesn't block)
        cleanupOldLogsViaIndex(storage, retentionDays)
          .then(result => {
            if (result.deletedCount > 0) {
              console.log(`Backup Upload: Background cleanup deleted ${result.deletedCount} logs older than ${result.retentionDays} days`);
            }
          })
          .catch(err => {
            console.error(`Backup Upload: Background cleanup failed (non-critical): ${err.message}`);
          });

        const responsePayload = { url: `${FRONTEND_URL}?key=${key}#${password}` };

        return new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (kvErr) {
        // Own KV storage failed, try next level backup API if configured
        const errorMsg = String(kvErr?.message || kvErr?.toString() || 'Unknown error');
        console.error(`Backup Upload: Own KV storage failed: ${errorMsg}`);

        const backupApiUrl = await resolveBackupApi(env);
        if (backupApiUrl) {
          console.log(`Backup Upload: Own KV failed, attempting next level backup API at ${backupApiUrl}...`);
          try {
            const visitedHosts = body.visitedHosts || [];
            const currentHost = new URL(request.url).host;
            const backupResult = await uploadToBackupApi(backupApiUrl, uniform_id, name, logdata, [...visitedHosts, currentHost]);
            console.log(`Backup Upload: Successfully forwarded to next level backup API:`, backupResult);

            // Return backup API's response directly
            return new Response(JSON.stringify(backupResult), {
              status: 202,
              headers: { 'Content-Type': 'application/json' },
            });
          } catch (backupErr) {
            const backupMsg = String(backupErr?.message || backupErr?.toString() || 'Unknown error');
            console.error('Backup Upload: Next level backup API also failed:', backupMsg);

            // Both own KV and next level backup API failed
            const fullErrorMsg = `Own KV storage error: ${errorMsg}\n\nNext level backup API error: ${backupMsg}`;
            return new Response(fullErrorMsg, { status: 500 });
          }
        } else {
          // No backup API configured and own KV failed
          console.log('Backup Upload: Own KV failed and no next level backup API configured');
          const fullErrorMsg = `Own KV storage error: ${errorMsg}\n\nNo next level backup API configured`;
          return new Response(fullErrorMsg, { status: 500 });
        }
      }

    } catch (error) {
      console.error('Backup upload error:', error);
      return new Response(error.stack || 'Internal Server Error', { status: 500 });
    }
  }

  // --- Route 5: W4123 Upload (Lua Plugin Support) ---
  if ((pathname === '/api/dice/w4123' || pathname.endsWith('/api/dice/w4123')) && (request.method === 'PUT' || request.method === 'POST')) {
    console.log('[ROUTE] Matched: W4123 Upload');
    try {
      const contentLength = request.headers.get('Content-Length');
      if (contentLength && parseInt(contentLength, 10) > FILE_SIZE_LIMIT_MB * 1024 * 1024) {
        return new Response(
          JSON.stringify({ success: false, message: `File size exceeds ${FILE_SIZE_LIMIT_MB}MB limit` }),
          { status: 413, headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, POST, OPTIONS'), 'Content-Type': 'application/json' } }
        );
      }

      let name, uniform_id, logdata;
      
      // 支持multipart/form-data（lua插件使用）和JSON两种格式
      const contentType = request.headers.get('Content-Type') || '';
      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        name = formData.get("name");
        uniform_id = formData.get("uniform_id");
        const file = formData.get("file");

        if (!name || !uniform_id || !file) {
          return new Response(
            JSON.stringify({ success: false, message: "Missing required fields: name, uniform_id, or file" }),
            { status: 400, headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, POST, OPTIONS'), 'Content-Type': 'application/json' } }
          );
        }

        if (file.size > FILE_SIZE_LIMIT_MB * 1024 * 1024) {
          return new Response(
            JSON.stringify({ success: false, message: `File size exceeds ${FILE_SIZE_LIMIT_MB}MB limit` }),
            { status: 413, headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, POST, OPTIONS'), 'Content-Type': 'application/json' } }
          );
        }

        // 读取文件内容
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // 将文本内容转换为SealDice格式的JSON
        const text = new TextDecoder('utf-8').decode(uint8Array);
        const logItems = parseTextLogToSealDiceFormat(text);
        
        if (logItems.length === 0) {
          return new Response(
            JSON.stringify({ success: false, message: "日志解析失败：没有找到有效的日志条目" }),
            { status: 400, headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, POST, OPTIONS'), 'Content-Type': 'application/json' } }
          );
        }
        
        // 构建SealDice格式的JSON
        const logJson = JSON.stringify({
          version: 1,
          items: logItems
        });
        
        // zlib压缩
        const textEncoder = new TextEncoder();
        const logBytes = textEncoder.encode(logJson);
        const compressed = zlibSync(logBytes);
        
        // Base64编码
        let binaryString = '';
        compressed.forEach((byte) => { binaryString += String.fromCharCode(byte); });
        logdata = btoa(binaryString);
        
        console.log(`[W4123] Original size: ${logBytes.length} bytes, Compressed: ${compressed.length} bytes, Ratio: ${(compressed.length / logBytes.length * 100).toFixed(1)}%`);
        
      } else {
        // JSON格式
        const body = await request.json();
        name = body.name;
        logdata = body.logdata;
        uniform_id = body.uniform_id;

        if (!uniform_id || !name || !logdata) {
          return new Response(
            JSON.stringify({ success: false, message: "Missing required fields: uniform_id, name, or logdata" }),
            { status: 400, headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, POST, OPTIONS'), 'Content-Type': 'application/json' } }
          );
        }
      }

      // 验证uniform_id格式
      if (!/^[^:]+:[A-Za-z0-9_\-\.]+$/.test(uniform_id)) {
        return new Response(
          JSON.stringify({ success: false, message: "uniform_id field did not pass validation" }),
          { status: 400, headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, POST, OPTIONS'), 'Content-Type': 'application/json' } }
        );
      }

      const retentionDays = getLogRetentionDays(env);
      const password = Math.floor(Math.random() * (999999 - 100000 + 1) + 100000);
      const key = generateRandomString(4);
      const storageKey = `${key}#${password}`;
      
      // 生成存储数据（使用SealDice客户端类型）
      const logContent = JSON.stringify({
        client: "SealDice",
        created_at: new Date().toISOString(),
        data: logdata,
        name: name,
        note: "Uploaded by w4123 plugin",
        updated_at: new Date().toISOString(),
      });

      try {
        // 存储到KV
        await storage.put(storageKey, logContent);
        console.log(`W4123 Upload: Successfully saved with key: ${storageKey}`);

        // 添加到索引表
        await addToIndexTable(storage, storageKey);
        console.log(`W4123 Upload: Added to index table successfully`);

        // 后台清理过期日志
        cleanupOldLogsViaIndex(storage, retentionDays)
          .then(result => {
            if (result.deletedCount > 0) {
              console.log(`W4123 Upload: Background cleanup deleted ${result.deletedCount} logs older than ${result.retentionDays} days`);
            }
          })
          .catch(err => {
            console.error(`W4123 Upload: Background cleanup failed (non-critical): ${err.message}`);
          });

        const responsePayload = { url: `${FRONTEND_URL}?key=${key}#${password}` };

        return new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, POST, OPTIONS'), 'Content-Type': 'application/json' },
        });
      } catch (kvErr) {
        const errorMsg = String(kvErr?.message || kvErr?.toString() || 'Unknown error');
        console.error(`W4123 Upload: KV storage failed: ${errorMsg}`);
        return new Response(`KV storage error: ${errorMsg}`, { 
          status: 500,
          headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, POST, OPTIONS'), 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      console.error('W4123 upload error:', error);
      const errorMsg = error.stack || error.message || 'Internal Server Error';
      return new Response(JSON.stringify({ 
        success: false, 
        message: errorMsg 
      }), { 
        status: 500,
        headers: { ...getCorsHeaders(FRONTEND_URL, 'PUT, POST, OPTIONS'), 'Content-Type': 'application/json' }
      });
    }
  }

  // --- Fallback: Not Found ---
  console.log(`[FALLBACK] No route matched for: ${request.method} ${pathname}`);
  return new Response('访问的API接口不存在或方式错误，检查API设置是否正确', { status: 404 });
}

/**
 * Parse text log to SealDice format
 * 格式示例: 昵称(ID) 时间\n消息内容\n\n
 */
function parseTextLogToSealDiceFormat(text) {
  const items = [];
  const lines = text.split('\n');
  let currentItem = null;
  let id = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 匹配格式: 昵称(ID) 时间
    const headerMatch = line.match(/^(.+)\((.+?)\)\s+(.+)$/);
    if (headerMatch) {
      // 保存前一个item
      if (currentItem && currentItem.message) {
        currentItem.id = ++id;
        currentItem.isDice = isDiceCommand(currentItem.message);
        currentItem.commandId = currentItem.isDice ? 1 : 0;
        items.push(currentItem);
      }
      
      // 开始新item
      currentItem = {
        nickname: headerMatch[1],
        IMUserId: headerMatch[2],
        timeText: headerMatch[3],
        message: '',
      };
      
      // 尝试解析时间
      const timeMatch = headerMatch[3].match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
      if (timeMatch) {
        const time = new Date(timeMatch[1]);
        if (!isNaN(time.getTime())) {
          currentItem.time = Math.floor(time.getTime() / 1000);
        }
      }
    } else if (currentItem && line !== '') {
      // 添加消息内容
      if (currentItem.message) {
        currentItem.message += '\n' + line;
      } else {
        currentItem.message = line;
      }
    }
  }
  
  // 保存最后一个item
  if (currentItem && currentItem.message) {
    currentItem.id = ++id;
    currentItem.isDice = isDiceCommand(currentItem.message);
    currentItem.commandId = currentItem.isDice ? 1 : 0;
    items.push(currentItem);
  }
  
  return items;
}

/**
 * Check if message is a dice command
 */
function isDiceCommand(message) {
  const diceCommands = ['.r', '.rh', '.ra', '.raa', '.rs', '.rc', '.d', '.log', '.nn', '.n'];
  const lowerMsg = message.trim().toLowerCase();
  return diceCommands.some(cmd => lowerMsg.startsWith(cmd));
}

// ─── EdgeOne KV 存储适配器（包装全局 XBSKV 绑定）────────────────
class EdgeOneKVStorage {
  constructor(kv) { this.kv = kv; }
  get(key) { return this.kv.get(key); }
  put(key, value) { return this.kv.put(key, value); }
  delete(key) { return this.kv.delete(key); }
  // EdgeOne KV 无原生 list；靠索引表(0Aindex)枚举，故不实现 list()。
}

// ─── EdgeOne Pages Function 入口（薄封装）────────────────────
// 本地/自建部署走 server.js，注入 SQLite/S3/COS 存储后调用 handleDiceRequest。
export async function onRequest({ request, env }) {
  if (typeof XBSKV === 'undefined') {
    return new Response('严重错误：API服务找不到全局KV绑定"XBSKV"。请向日志站维护者反馈修正 EdgeOne Pages 配置。CRITICAL ERROR: Global KV Binding "XBSKV" not found. Please verify EdgeOne Pages configuration.', { status: 500 });
  }
  return handleDiceRequest(request, new EdgeOneKVStorage(XBSKV), env);
}
