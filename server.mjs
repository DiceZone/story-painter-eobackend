// DiceNext 日志站 —— 本地/自建部署入口（Node HTTP 服务器）。
// 复用 EdgeOne 函数里的 handleDiceRequest；存储后端由 STORAGE_TYPE 选择（sqlite/s3/cos）。
//
// 运行：
//   STORAGE_TYPE=sqlite SQLITE_PATH=./data/logs.db FRONTEND_URL=https://你的染色器域名 \
//   PORT=8787 node server.mjs
//
// 反代到 /api/dice/* 即可对接骰子上传与染色器读取。
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { getLocalStorage } from './src/storage/index.js';

// 处理函数所在文件名含方括号（[...slug].js），静态 import 在 Node ESM 下不稳，
// 用绝对路径 + pathToFileURL 动态导入（正确编码特殊字符）。
const __dirname = dirname(fileURLToPath(import.meta.url));
const handlerHref = pathToFileURL(join(__dirname, 'functions', 'api', 'dice', '[...slug].js')).href;
const { handleDiceRequest } = await import(handlerHref);

const PORT = parseInt(process.env.PORT || '8787', 10);
const storage = await getLocalStorage(process.env);

const server = createServer(async (req, res) => {
  try {
    // Node 请求 → Fetch Request（handleDiceRequest 全程用 Web 标准 API）
    const url = `http://${req.headers.host || `localhost:${PORT}`}${req.url}`;
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = Buffer.concat(chunks);
    }
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: body && body.length ? body : undefined,
    });

    const response = await handleDiceRequest(request, storage, process.env);

    // Fetch Response → Node 响应
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (err) {
    console.error('[server] error:', err);
    res.statusCode = 500;
    res.end(String((err && err.stack) || err));
  }
});

server.listen(PORT, () => {
  const type = (process.env.STORAGE_TYPE || 'sqlite').toLowerCase();
  console.log(`DiceNext 日志站已启动: http://localhost:${PORT}  (storage=${type})`);
  console.log(`  上传:   PUT  /api/dice/log`);
  console.log(`  读取:   GET  /api/dice/load_data?key=..&password=..`);
  console.log(`  清理:   GET  /api/dice/cleanup`);
  if (!process.env.FRONTEND_URL) console.warn('  ⚠️ 未设置 FRONTEND_URL（染色器地址），上传返回的链接与 CORS 会不正确。');
});
