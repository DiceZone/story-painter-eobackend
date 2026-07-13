// 腾讯云 COS 存储适配器（原生 cos-nodejs-sdk-v5，可选依赖，仅 STORAGE_TYPE=cos 时加载）。
// 环境变量：COS_SECRET_ID COS_SECRET_KEY COS_BUCKET(如 name-1250000000) COS_REGION(如 ap-guangzhou)
//           COS_PREFIX(默认 dicelog/)
import COS from 'cos-nodejs-sdk-v5';

export function createCosStorage(env) {
  const e = (k) => (env && env[k]) || process.env[k];
  const Bucket = e('COS_BUCKET');
  const Region = e('COS_REGION');
  const prefix = e('COS_PREFIX') || 'dicelog/';
  if (!Bucket || !Region) throw new Error('COS 存储需设置 COS_BUCKET 与 COS_REGION');
  const cos = new COS({ SecretId: e('COS_SECRET_ID'), SecretKey: e('COS_SECRET_KEY') });
  const objKey = (key) => prefix + encodeURIComponent(key);
  return {
    get(key) {
      return new Promise((resolve, reject) => {
        cos.getObject({ Bucket, Region, Key: objKey(key) }, (err, data) => {
          if (err) { if (err.statusCode === 404) return resolve(null); return reject(err); }
          resolve(data.Body.toString('utf-8'));
        });
      });
    },
    put(key, value) {
      return new Promise((resolve, reject) => {
        cos.putObject({ Bucket, Region, Key: objKey(key), Body: value }, (err) => err ? reject(err) : resolve());
      });
    },
    delete(key) {
      return new Promise((resolve, reject) => {
        cos.deleteObject({ Bucket, Region, Key: objKey(key) }, (err) => err ? reject(err) : resolve());
      });
    },
    list() {
      return new Promise((resolve, reject) => {
        cos.getBucket({ Bucket, Region, Prefix: prefix }, (err, data) => {
          if (err) return reject(err);
          resolve((data.Contents || []).map(o => decodeURIComponent(o.Key.slice(prefix.length))));
        });
      });
    },
  };
}
