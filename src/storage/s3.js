// S3 / S3 兼容存储适配器（AWS S3、MinIO，也可指向腾讯云 COS 的 S3 兼容端点）。
// 需安装 @aws-sdk/client-s3（可选依赖，仅 STORAGE_TYPE=s3 时按需加载）。
// 环境变量：S3_BUCKET S3_REGION S3_ENDPOINT S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY
//           S3_PREFIX(默认 dicelog/) S3_FORCE_PATH_STYLE(MinIO 设 true)
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

export function createS3Storage(env) {
  const e = (k) => (env && env[k]) || process.env[k];
  const bucket = e('S3_BUCKET');
  const prefix = e('S3_PREFIX') || 'dicelog/';
  if (!bucket) throw new Error('S3 存储需设置 S3_BUCKET');
  const client = new S3Client({
    region: e('S3_REGION') || 'us-east-1',
    endpoint: e('S3_ENDPOINT') || undefined,
    forcePathStyle: (e('S3_FORCE_PATH_STYLE') || 'false') === 'true',
    credentials: {
      accessKeyId: e('S3_ACCESS_KEY_ID'),
      secretAccessKey: e('S3_SECRET_ACCESS_KEY'),
    },
  });
  // 键含 '#'（<key>#<password>），编码为对象名避免歧义。
  const objKey = (key) => prefix + encodeURIComponent(key);
  return {
    async get(key) {
      try {
        const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objKey(key) }));
        return await r.Body.transformToString('utf-8');
      } catch (err) {
        if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },
    async put(key, value) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: objKey(key), Body: value, ContentType: 'application/json' }));
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objKey(key) }));
    },
    async list() {
      const keys = [];
      let token;
      do {
        const r = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of (r.Contents || [])) keys.push(decodeURIComponent(o.Key.slice(prefix.length)));
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
  };
}
