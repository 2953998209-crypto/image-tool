# 智能图片处理工具

一个**纯前端 + 轻量 Node 代理**的图片处理网站：

- **① 文字提取（OCR）**：浏览器内本地识别图中文字（中英混合），可复制。
- **② 文字修改**：点击图中高亮文字块，替换为新文字并写回图片（不改原图，支持下载）。
- **③ 物体替换 / 自由重绘**：用画笔涂抹要替换的区域，填写描述后由 AI 重绘任意事物；也支持“上传 PNG 贴图”免密钥替换。

> 原图始终不会被修改，所有结果均可单独下载。

## 功能与密钥关系
| 功能 | 是否需要 AI Key |
|------|----------------|
| 文字提取 OCR | 否（Tesseract.js 浏览器本地运行） |
| 文字修改（基础擦除+重写） | 否 |
| 贴图替换（上传 PNG） | 否 |
| AI 重绘 / AI 完美修复背景 | 是（OpenAI 或 Stability AI） |

AI Key 在右上角「⚙️ AI 设置」中填写，仅保存在你本机浏览器，请求时由本站后端转发（或直接由浏览器调用，取决于调用方式），不会持久化到服务器。

## 本地运行
```bash
npm start            # 启动后访问 http://localhost:3000
```
（Node ≥ 18，无需安装任何依赖，server.js 为零依赖实现。）

## 部署（获取长期稳定网址）

### 方式 A：纯静态（最简单，30 秒，推荐先试）
把仓库根目录（含 `index.html` 的目录）拖到 https://app.netlify.com/drop 即可获得稳定网址。
之后在站内「⚙️ AI 设置 → 调用方式」选择 **浏览器直连 AI**，即可使用 AI 功能（需自备 Key）。

也适用于 GitHub Pages / Vercel 静态托管（`netlify.toml` 已包含）。

### 方式 B：带后端代理（AI 调用最稳，免 CORS 问题）
把整个项目部署到任意 Node 平台（Render / Railway / Fly.io 免费额度）：
1. 新建 Web Service，连接到本仓库。
2. Build 命令留空，Start 命令 `npm start`。
3. 平台会自动分配一个长期稳定网址。
默认「调用方式 = 本站代理」即可，AI 请求由服务器转发，规避浏览器 CORS 限制。

## 目录结构
```
image-tool/
├─ server.js          # 零依赖 Node 服务：托管静态文件 + /api/inpaint AI 代理
├─ index.html         # 前端页面
├─ styles.css
├─ app.js             # 前端逻辑（OCR / 文字修改 / 物体替换）
├─ netlify.toml
└─ package.json
```
