// Vercel Node serverless function（AI 图像重绘代理）
// 由前端「本站代理」模式调用，转发到 OpenAI / Stability，规避浏览器 CORS。
// 部署到 Vercel 后，访问 https://<project>.vercel.app/api/inpaint 即可。

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { provider, apiKey, model, size, prompt, image, mask } = body || {};
  if (!apiKey) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'missing_api_key' }));
    return;
  }
  try {
    const result = provider === 'stability'
      ? await stabilityInpaint({ apiKey, model, size, prompt, image, mask })
      : await openaiInpaint({ apiKey, model, size, prompt, image, mask });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ result }));
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
};

module.exports.config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '15mb' } },
};

function b64ToBuffer(b64) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(b64);
  const bin = m ? m[2] : b64;
  return Buffer.from(bin, 'base64');
}
function bufToB64(buf) { return Buffer.from(buf).toString('base64'); }

async function openaiInpaint({ apiKey, model, size, prompt, image, mask }) {
  const fd = new FormData();
  fd.append('image', new Blob([b64ToBuffer(image)], { type: 'image/png' }), 'image.png');
  fd.append('mask', new Blob([b64ToBuffer(mask)], { type: 'image/png' }), 'mask.png');
  fd.append('prompt', prompt);
  fd.append('model', model || 'gpt-image-1');
  fd.append('size', size || '1024x1024');
  fd.append('n', '1');
  fd.append('response_format', 'b64_json');
  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('OpenAI ' + r.status + ': ' + t.slice(0, 300));
  }
  const j = await r.json();
  const it = j.data && j.data[0];
  if (!it) throw new Error('OpenAI returned empty');
  return it.b64_json ? `data:image/png;base64,${it.b64_json}` : it.url;
}

async function stabilityInpaint({ apiKey, model, size, prompt, image, mask }) {
  const fd = new FormData();
  fd.append('image', new Blob([b64ToBuffer(image)], { type: 'image/png' }), 'image.png');
  fd.append('mask', new Blob([b64ToBuffer(mask)], { type: 'image/png' }), 'mask.png');
  fd.append('prompt', prompt);
  fd.append('mode', 'mask');
  fd.append('output_format', 'png');
  if (model) fd.append('model', model);
  const r = await fetch('https://api.stability.ai/v2beta/stable-image/edit/inpaint', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'image/*' },
    body: fd,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('Stability ' + r.status + ': ' + t.slice(0, 300));
  }
  const buf = await r.arrayBuffer();
  return `data:image/png;base64,${bufToB64(buf)}`;
}
