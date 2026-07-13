// 存储后端工厂：按 STORAGE_TYPE 选择适配器（本地/自建部署用；EdgeOne 走全局 XBSKV）。
// 各适配器按需动态导入，未选用的后端不加载其依赖（S3/COS SDK 为可选依赖）。
export async function getLocalStorage(env) {
  const type = ((env && env.STORAGE_TYPE) || process.env.STORAGE_TYPE || 'sqlite').toLowerCase();
  switch (type) {
    case 'sqlite': {
      const m = await import('./sqlite.mjs');
      return m.createSqliteStorage(env);
    }
    case 's3': {
      const m = await import('./s3.mjs');
      return m.createS3Storage(env);
    }
    case 'cos': {
      const m = await import('./cos.mjs');
      return m.createCosStorage(env);
    }
    case 'edgeone':
      throw new Error('STORAGE_TYPE=edgeone 仅在 EdgeOne Pages 环境有效（依赖全局 XBSKV），请用 EdgeOne 部署或改用 sqlite/s3/cos');
    default:
      throw new Error('未知 STORAGE_TYPE: ' + type + '（可选 sqlite | s3 | cos）');
  }
}
