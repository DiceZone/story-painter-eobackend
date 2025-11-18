# SealDice Log Backend

[![Node](https://img.shields.io/badge/node-%3E=18-green)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/next-14.x-black)](https://nextjs.org/)
[![EdgeOne](https://img.shields.io/badge/EdgeOne-Pages-blue)](https://console.cloud.tencent.com/edgeone/pages)

用于接收并存储海豹核心的跑团日志，接口返回查看链接。

## 接口
- PUT /api/dice/log（multipart/form-data：name，uniform_id=xxx:数字，file<2MB）
- GET /api/dice/load_data?key=AbCd&password=123456
- 成功返回示例：{"url":"https://your-frontend.example.com/?key=AbCd#123456"}

## 配置（必填，二选一）
优先级：部署时设置环境变量 FRONTEND_URL > 文件 config/appConfig.js  
两者都未提供时：接口返回 500 并提示配置。

- 部署时变量（推荐）
  FRONTEND_URL=https://your-frontend.example.com/
- 或：编辑文件 config/appConfig.js
  export const FRONTEND_URL = 'https://your-frontend.example.com/';

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
- Fork [前端项目](https://log-api.shia.loli.band/api/dice/log) 
- 在 EdgeOne Pages 里创建前端项目
- 将你 Fork 的前端项目的 `src/store.ts` 文件中的 `https://weizaima.com/dice/api/load_data` 修改为 `https://your-backend.example.com/api/dice/load_data`
- 进入 `项目设置` - `域名管理` ，点击 `添加自定义域名` 并按照提示为域名绑定 CNAME
- 等待 EdgeOne Pages 自动构建完成

## 项目参考
[海豹骰日志后端 - Worker版](https://github.com/sealdice/story-painter) 
