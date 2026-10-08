// 零依赖 Node 服务器：托管前端静态文件 + 代理 AI 图像重绘（避免浏览器 CORS 与密钥暴露）
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC = __dirname; // 站点文件位于仓库根目录（与 GitHub Pages 保持一致）

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function b64ToBuffer(dataUrl) {
  // 接受 "data:image/png;base64,...." 或 裸 base64
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  const b64 = m ? m[2] : dataUrl;
  return Buffer.from(b64, 'base64');
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 30 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------- AI 提供商实现 ----------

async function openaiInpaint({ apiKey, model, prompt, image, mask, size, n, quality }) {
  const form = new FormData();
  form.append('image', new Blob([b64ToBuffer(image)], { type: 'image/png' }), 'image.png');
  form.append('mask', new Blob([b64ToBuffer(mask)], { type: 'image/png' }), 'mask.png');
  form.append('prompt', prompt);
  form.append('model', model || 'gpt-image-1');
  form.append('size', size || '1024x1024');
  form.append('n', String(n || 1));
  if (quality) form.append('quality', quality);
  form.append('response_format', 'b64_json');

  const resp = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${t.slice(0, 500)}`);
  }
  const j = await resp.json();
  const item = j.data && j.data[0];
  if (!item) throw new Error('OpenAI 返回为空');
  return item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url;
}

async function stabilityInpaint({ apiKey, prompt, image, mask, model, size }) {
  const form = new FormData();
  form.append('image', new Blob([b64ToBuffer(image)], { type: 'image/png' }), 'image.png');
  // Stability 的 mask：白色(255)=要重绘区域，黑色(0)=保留区域
  form.append('mask', new Blob([b64ToBuffer(mask)], { type: 'image/png' }), 'mask.png');
  form.append('prompt', prompt);
  form.append('mode', 'mask');
  form.append('output_format', 'png');
  if (model) form.append('model', model);

  const resp = await fetch('https://api.stability.ai/v2beta/stable-image/edit/inpaint', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'image/*' },
    body: form
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Stability ${resp.status}: ${t.slice(0, 500)}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function handleInpaint(req, res) {
  try {
    const body = await readBody(req);
    const p = JSON.parse(body);
    if (!p.apiKey) return sendJson(res, 400, { error: '缺少 API Key' });
    if (!p.image || !p.mask || !p.prompt) return sendJson(res, 400, { error: '缺少 image / mask / prompt' });

    let out;
    if (p.provider === 'stability') out = await stabilityInpaint(p);
    else out = await openaiInpaint(p);
    sendJson(res, 200, { result: out });
  } catch (e) {
    sendJson(res, 500, { error: e.message || String(e) });
  }
}

// ---------- 静态托管 ----------
function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p === '/') p = '/index.html';
  const fp = path.join(PUBLIC, path.normalize(p));
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname === '/api/inpaint' && req.method === 'POST') return handleInpaint(req, res);
  if (u.pathname === '/api/health') return sendJson(res, 200, { ok: true });
  return serveStatic(req, res, u.pathname);
});

server.listen(PORT, () => {
  console.log(`Image tool running at http://localhost:${PORT}`);
});
