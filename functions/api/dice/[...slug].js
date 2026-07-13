// EdgeOne Pages Function 入口（薄封装）。核心逻辑在 ../../../src/lib/dice-handler.mjs，
// 与存储后端解耦；本地/自建部署走根目录 server.mjs。
import { handleDiceRequest } from '../../../src/lib/dice-handler.mjs';

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
