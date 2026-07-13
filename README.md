# SealDice Log Backend

[![Node](https://img.shields.io/badge/node-%3E=18-green)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/next-14.x-black)](https://nextjs.org/)
[![EdgeOne](https://img.shields.io/badge/EdgeOne-Pages-blue)](https://console.cloud.tencent.com/edgeone/pages)

用于接收并存储海豹核心的跑团日志，接口返回查看链接。

## 接口
- PUT /api/dice/log（multipart/form-data：name，uniform_id=xxx:数字，file<5MB）
- POST /api/dice/w4123（专门为 w4123/Dice 的第三方日志上传插件提供的上传接口）
- PUT /api/dice/backup-upload（备用上传接口，主存储失败时自动调用，支持级联）
- GET/POST /api/dice/cleanup（手动触发日志清理）
- GET /api/dice/load_data?key=AbCd&password=123456
- 成功返回示例：{"url":"https://your-frontend.example.com/?key=AbCd#123456"}

## 本地/自建部署（多存储后端）

除 EdgeOne Pages（白嫖 KV）外，可用 `server.mjs` 自建部署，存储后端可选 **SQLite（零依赖）/ S3 / 腾讯云 COS**。

```bash
cp .env.example .env      # 按需填写 FRONTEND_URL、STORAGE_TYPE 等
npm install               # SQLite 无需额外依赖；S3/COS 见下
STORAGE_TYPE=sqlite FRONTEND_URL=https://你的染色器 node server.mjs
# 或： npm run start:local
```

- **STORAGE_TYPE=sqlite**（默认）：本地文件 `SQLITE_PATH`（默认 `./data/logs.db`），用 Node 内建 `node:sqlite`，无需编译原生模块。
- **STORAGE_TYPE=s3**：AWS S3 / MinIO / COS 的 S3 兼容端点。需 `npm i @aws-sdk/client-s3`，配 `S3_BUCKET/S3_REGION/S3_ENDPOINT/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY`。
- **STORAGE_TYPE=cos**：腾讯云 COS 原生 SDK。需 `npm i cos-nodejs-sdk-v5`，配 `COS_SECRET_ID/COS_SECRET_KEY/COS_BUCKET/COS_REGION`。

存储层是 `get/put/delete/list` 接口（`src/storage/`），核心路由 `handleDiceRequest`（`functions/api/dice/[...slug].js`）与存储解耦：EdgeOne 走全局 `XBSKV`，本地走 `server.mjs` 注入的适配器。新增后端只需实现该接口并在 `src/storage/index.js` 注册。

## DiceNext 专属格式（client=DiceNext）

除海豹的 `client=SealDice`（zlib JSON）/`Parquet`（parquet）外，新增轻量的 **`client=DiceNext` = zstd 压缩的 `{items,version:105}` JSON**：压缩比接近 V105 却无需 parquet 重依赖（染色器仅用 fzstd 解压）。上传方在 multipart 里带 `client=DiceNext` 即可，后端透传该字段、染色器据此解码。

## 配置

### 前端配置（必填）
优先级：部署时设置环境变量 FRONTEND_URL > 文件 config/appConfig.js  
两者都未提供时：接口返回 500 并提示配置。

- 部署时变量（推荐）
  FRONTEND_URL=https://your-frontend.example.com/
- 或：编辑文件 config/appConfig.js
  export const FRONTEND_URL = 'https://your-frontend.example.com/';

### 备用站API（可选）
配置备用API实现日志上传高可用，当主存储失败时自动转发到备用服务器。

优先级：部署时设置环境变量 BACKUP_UPLOAD_API > 文件 config/appConfig.js

- 部署时变量（推荐）
  BACKUP_UPLOAD_API=https://backup-server.example.com/api/dice/backup-upload
- 或：编辑文件 config/appConfig.js
  export const BACKUP_UPLOAD_API = 'https://backup-server.example.com/api/dice/backup-upload';

**级联支持**  
同一套代码可部署在不同域名上，形成链式备用关系：主服务器 → 备用服务器1 → 备用服务器2 → ...

### 日志保留策略（可选）
为了防止 KV 存储容量溢出，系统支持自动清理过期日志。

优先级：部署时设置环境变量 LOG_RETENTION_DAYS > 文件 config/appConfig.js > 默认值（30天）

- 部署时变量（推荐）
  LOG_RETENTION_DAYS=60（保留 60 天的日志）
- 或：编辑文件 config/appConfig.js
  export const LOG_RETENTION_DAYS = 60;

**工作机制**
- 用户每次上传日志时，后端会自动检查索引键
- 按照索引删除超过指定天数的旧日志
- 清理过程异步执行，不会影响用户的上传响应

#### 清理接口使用说明
GET 或 POST 请求 `/api/dice/cleanup` 可手动触发日志清理过程，允许浏览器直接请求该接口。

**请求方式：** GET 或 POST  
**响应格式：** JSON

清理过程会根据配置的保留天数（LOG_RETENTION_DAYS）删除过期日志，并返回操作统计信息。

## 部署到EdgeOne Pages
### 部署后端
- Fork 本项目
- 在 EdgeOne Pages 控制台点击 `创建项目` ，选择导入 `Git 仓库` 
- 绑定你的 GitHub 账户，选择你刚刚 Fork 的本项目
- 以下操作二选一：
	- 在 `环境变量` 中添加环境变量：变量名 `FRONTEND_URL` 变量值 `https://your-frontend.example.com/`
	- 修改文件 config/appConfig.js，将 `FRONTEND_URL` 的值修改为 `https://your-frontend.example.com/`
- 慎重选择 `加速区域` ，如果你的域名未备案，请选择 `全球可用区（不含中国大陆）`
- 点击 `开始部署` 按钮
- 新建一个 KV 存储的命名空间，绑定到你刚刚创建的项目，变量名称设置为 `XBSKV`
- 重新构建项目
- 进入 `项目设置` - `域名管理` ，点击 `添加自定义域名` 并按照提示为域名绑定 CNAME

### 部署前端
- Fork [前端项目](https://github.com/sealdice/story-painter) 
- 在 EdgeOne Pages 里创建前端项目
- 将你 Fork 的前端项目的 `src/store.ts` 文件中的 `https://weizaima.com/dice/api/load_data` 修改为 `https://your-backend.example.com/api/dice/load_data`
- 进入 `项目设置` - `域名管理` ，点击 `添加自定义域名` 并按照提示为域名绑定 CNAME
- 等待 EdgeOne Pages 自动构建完成

## 项目参考
[海豹骰日志后端 - Worker版](https://github.com/sealdice/story-painter-cfbackend) 
