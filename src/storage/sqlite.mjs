// 本地 SQLite 存储适配器（Node 内建 node:sqlite，无需编译原生模块）。
// 表 kv(key, value)；键沿用 "<key>#<password>" 与索引键 '0Aindex'。
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createSqliteStorage(env) {
  const path = (env && env.SQLITE_PATH) || process.env.SQLITE_PATH || './data/logs.db';
  try { mkdirSync(dirname(path), { recursive: true }); } catch { /* ignore */ }
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  const getStmt = db.prepare('SELECT value FROM kv WHERE key = ?');
  const putStmt = db.prepare('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const delStmt = db.prepare('DELETE FROM kv WHERE key = ?');
  const listStmt = db.prepare('SELECT key FROM kv');
  return {
    async get(key) { const r = getStmt.get(key); return r ? r.value : null; },
    async put(key, value) { putStmt.run(key, value); },
    async delete(key) { delStmt.run(key); },
    async list() { return listStmt.all().map(r => r.key); },
  };
}
