/* 智能图片处理工具 - 前端逻辑（原生 JS，无构建） */
(function () {
  'use strict';

  // ---------- 全局状态 ----------
  const state = {
    img: null,            // 已加载的 HTMLImageElement
    fileName: '',
    scale: 1,             // 显示比例（基于原图）
    dispW: 0, dispH: 0,   // 显示画布尺寸
    ocr: null,            // { text, words:[{text,bbox:{x0,y0,x1,y1},confidence}] }
    selectedBlock: null,  // 文字修改选中的词块
    brush: 28,            // 画笔大小（显示像素）
    tab: 'ocr'
  };

  const MAX_DISP = 760; // 显示画布最长边上限

  // ---------- 元素缓存 ----------
  const el = {};
  function $(id) { return document.getElementById(id); }
  function cache() {
    ['file','drop','uploadActions','fileName','changeImg','stageCard','canvasBox',
     'stage','overlay','side','openSettings','settingsModal','closeSettings','saveSettings',
     'setProvider','setKey','setModel','setSize','setMode','wmBrush','wmClear','wmPrompt','wmRun','wmStatus','wmResultBox','wmDownloadRow','wmDownload'].forEach(id => el[id] = $(id));
  }

  const stage = () => el.stage;
  const overlay = () => el.overlay;

  // ---------- 工具函数 ----------
  function fitScale(w, h) {
    const s = Math.min(MAX_DISP / w, MAX_DISP / h, 1);
    return s;
  }
  function toCanvasXY(canvas, e) {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    const y = (e.clientY - r.top) * (canvas.height / r.height);
    return { x, y };
  }
  function dataURLtoCanvas(dataUrl) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = dataUrl;
    });
  }
  function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ---------- 图片加载 ----------
  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) { alert('请选择图片文件'); return; }
    state.fileName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const im = new Image();
      im.onload = () => {
        state.img = im;
        el.fileName.textContent = file.name + `（${im.naturalWidth}×${im.naturalHeight}）`;
        el.uploadActions.style.display = 'flex';
        el.stageCard.style.display = 'block';
        prepareStage();
        renderSidebar();
        if (state.tab === 'ocr') runOCR();
      };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function prepareStage() {
    const im = state.img;
    state.scale = fitScale(im.naturalWidth, im.naturalHeight);
    state.dispW = Math.round(im.naturalWidth * state.scale);
    state.dispH = Math.round(im.naturalHeight * state.scale);
    [stage(), overlay()].forEach(c => { c.width = state.dispW; c.height = state.dispH; });
    drawStage();
    // overlay 初始透明
    const octx = overlay().getContext('2d');
    octx.clearRect(0, 0, state.dispW, state.dispH);
    overlay().style.opacity = (state.tab === 'replace') ? '0.55' : '1';
  }

  function drawStage() {
    const ctx = stage().getContext('2d');
    ctx.clearRect(0, 0, state.dispW, state.dispH);
    ctx.drawImage(state.img, 0, 0, state.dispW, state.dispH);
  }

  // ---------- Tab 切换 ----------
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    const ov = overlay();
    const octx = ov.getContext('2d');
    octx.clearRect(0, 0, state.dispW, state.dispH);
    // 切换 tab 时清除 overlay 上可能残留的事件
    ov.onclick = null; ov.onpointerdown = null; ov.onpointermove = null; ov.onpointerup = null; ov.onpointerleave = null;
    ov.style.opacity = (tab === 'replace' || tab === 'wmPanel') ? '0.55' : '1';
    ov.style.pointerEvents = (tab === 'ocr') ? 'none' : 'auto';
    drawStage();
    renderSidebar();
    if (tab === 'ocr' && !state.ocr) runOCR();
    if (tab === 'edit' && !state.ocr) runOCR();
  }

  // ---------- OCR ----------
  async function runOCR() {
    if (!state.img) return;
    const status = document.getElementById('ocrStatus');
    if (status) { status.className = 'status busy'; status.textContent = '正在识别文字（首次需下载语言包，请稍候）…'; }
    try {
      const res = await Tesseract.recognize(state.img, 'chi_sim+eng', {
        logger: m => {
          if (m.status === 'recognizing text' && status) {
            status.className = 'status busy';
            status.textContent = `识别中… ${Math.round(m.progress * 100)}%`;
          }
        }
      });
      state.ocr = { text: res.data.text, words: (res.data.words || []).filter(w => w.text.trim()) };
      if (state.tab === 'ocr' || state.tab === 'edit') renderSidebar();
      if (status) { status.className = 'status ok'; status.textContent = `识别完成，共 ${state.ocr.words.length} 个文字块`; }
      if (state.tab === 'edit') drawBlocks();
    } catch (e) {
      if (status) { status.className = 'status err'; status.textContent = '识别失败：' + e.message; }
    }
  }

  function drawBlocks() {
    const octx = overlay().getContext('2d');
    octx.clearRect(0, 0, state.dispW, state.dispH);
    if (!state.ocr) return;
    octx.lineWidth = 2;
    state.ocr.words.forEach((w, i) => {
      const b = w.bbox;
      const x = b.x0 * state.scale, y = b.y0 * state.scale;
      const ww = (b.x1 - b.x0) * state.scale, hh = (b.y1 - b.y0) * state.scale;
      const sel = state.selectedBlock === i;
      octx.strokeStyle = sel ? '#7c5cff' : 'rgba(91,140,255,.85)';
      octx.strokeRect(x, y, ww, hh);
      if (sel) { octx.fillStyle = 'rgba(124,92,255,.18)'; octx.fillRect(x, y, ww, hh); }
    });
  }

  // ---------- 侧边栏（按 tab 渲染不同内容） ----------
  function renderSidebar() {
    const s = el.side;
    s.innerHTML = '';
    if (state.tab === 'ocr') s.appendChild(ocrPanel());
    else if (state.tab === 'edit') s.appendChild(editPanel());
    else if (state.tab === 'replace') s.appendChild(replacePanel());
    else if (state.tab === 'wmPanel') s.appendChild(wmPanel());
  }

  function statusEl(id) { const d = document.createElement('div'); d.id = id; d.className = 'status'; d.textContent = '就绪'; return d; }

  function ocrPanel() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <h3>① 文字提取（OCR）</h3>
      <p class="muted">自动识别图中文字，支持中英混合。结果可直接复制使用。</p>
      <div id="ocrStatus" class="status">就绪</div>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="reOcr">重新识别</button>
        <button class="btn primary" id="copyOcr">复制全部文字</button>
      </div>
      <div class="ocr-out" id="ocrOut" style="margin-top:10px">（尚未识别）</div>
    `;
    setTimeout(() => {
      $('reOcr').onclick = runOCR;
      $('copyOcr').onclick = () => {
        const t = state.ocr ? state.ocr.text : '';
        navigator.clipboard.writeText(t).then(() => flash($('ocrStatus'), '已复制到剪贴板', 'ok'));
      };
      const out = $('ocrOut');
      if (state.ocr) { out.textContent = state.ocr.text; }
    }, 0);
    return wrap;
  }

  function editPanel() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <h3>② 文字修改</h3>
      <p class="muted">点击画布上高亮的文字块进行选择，修改后点击“应用到图片”。不会改动你的原图，可随时下载新图。</p>
      <div class="status" id="editStatus">就绪</div>
      <div class="blocks" id="blocks" style="margin-top:10px"></div>
      <div class="field" style="margin-top:10px">
        <label>替换为的文字</label>
        <input type="text" id="newText" placeholder="输入新的文字" />
      </div>
      <div class="row" style="margin-top:8px">
        <div class="field"><label>字号</label><input type="number" id="fontSize" value="32" min="8" max="200" /></div>
        <div class="field"><label>颜色</label><input type="color" id="fontColor" value="#ffffff" style="height:38px"/></div>
      </div>
      <div class="field" style="margin-top:8px">
        <label>字体</label>
        <select id="fontFamily">
          <option value='"Microsoft YaHei",sans-serif'>微软雅黑</option>
          <option value='"SimSun",serif'>宋体</option>
          <option value='"KaiTi",serif'>楷体</option>
          <option value='Arial,sans-serif'>Arial</option>
          <option value='"Courier New",monospace'>等宽</option>
        </select>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="aiRepair">✨ AI 完美修复背景</button>
        <button class="btn primary" id="applyText">应用到图片</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn" id="undoEdit">撤销</button>
        <button class="btn primary" id="downloadEdit">下载修改后的图</button>
      </div>
    `;
    setTimeout(() => {
      const blocks = $('blocks');
      if (state.ocr && state.ocr.words.length) {
        state.ocr.words.forEach((w, i) => {
          const it = document.createElement('div');
          it.className = 'block-item';
          it.innerHTML = `<span>${escapeHtml(w.text)}</span><span class="c">${Math.round(w.confidence)}%</span>`;
          it.onclick = () => { state.selectedBlock = i; drawBlocks(); $('newText').value = w.text; };
          blocks.appendChild(it);
        });
      } else {
        blocks.innerHTML = '<div class="muted">暂无识别结果，请先在“文字提取”中识别。</div>';
      }
      $('aiRepair').onclick = aiRepairBackground;
      $('applyText').onclick = applyTextEdit;
      $('undoEdit').onclick = () => { drawStage(); drawBlocks(); flash($('editStatus'), '已撤销', 'ok'); };
      $('downloadEdit').onclick = downloadEdited;
      // 点击画布选择块
      overlay().onclick = (e) => {
        if (state.tab !== 'edit') return;
        const { x, y } = toCanvasXY(overlay(), e);
        const ox = x / state.scale, oy = y / state.scale;
        if (!state.ocr) return;
        let best = -1, bestD = 1e18;
        state.ocr.words.forEach((w, i) => {
          const b = w.bbox;
          if (ox >= b.x0 && ox <= b.x1 && oy >= b.y0 && oy <= b.y1) { best = i; }
          const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
          const d = (cx - ox) ** 2 + (cy - oy) ** 2;
          if (d < bestD) { bestD = d; best = i; }
        });
        if (best >= 0) { state.selectedBlock = best; drawBlocks(); $('newText').value = state.ocr.words[best].text; }
      };
    }, 0);
    return wrap;
  }

  function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // 在 work 画布（原图分辨率）上擦除选中块并用新文字覆盖
  function applyTextEdit() {
    if (state.selectedBlock == null || !state.ocr) { flash($('editStatus'), '请先选择要修改的文字块', 'err'); return; }
    const w = state.ocr.words[state.selectedBlock];
    const txt = $('newText').value;
    const fontSize = parseInt($('fontSize').value, 10) || 32;
    const color = $('fontColor').value;
    const font = $('fontFamily').value;
    const b = w.bbox;
    // 注意：bbox 为原图坐标，需乘以 scale 映射到当前显示画布
    const x0 = b.x0 * state.scale, y0 = b.y0 * state.scale;
    const x1 = b.x1 * state.scale, y1 = b.y1 * state.scale;
    const ctx = stage().getContext('2d');
    fillRegionWithBorderAvg(ctx, x0, y0, x1, y1);
    ctx.save();
    ctx.font = `${fontSize}px ${font}`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const ty = y0 - Math.max(0, (fontSize - (y1 - y0)) / 2);
    ctx.fillText(txt, x0, ty);
    ctx.restore();
    flash($('editStatus'), '已写入新文字，可继续编辑或下载', 'ok');
  }

  function fillRegionWithBorderAvg(ctx, x0, y0, x1, y1) {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(stage().width, Math.ceil(x1)); y1 = Math.min(stage().height, Math.ceil(y1));
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const ring = [];
    const step = 3;
    for (let x = x0; x < x1; x += step) { ring.push([x, y0], [x, y1 - 1]); }
    for (let y = y0; y < y1; y += step) { ring.push([x0, y], [x1 - 1, y]); }
    let r = 0, g = 0, bl = 0, n = 0;
    for (const [rx, ry] of ring) {
      const d = ctx.getImageData(rx, ry, 1, 1).data;
      r += d[0]; g += d[1]; bl += d[2]; n++;
    }
    if (n) { r = r / n; g = g / n; bl = bl / n; }
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${bl | 0})`;
    ctx.fillRect(x0, y0, w, h);
  }

  function downloadEdited() {
    // stage 已含文字修改（overlay 高亮不会被导出）
    const url = stage().toDataURL('image/png');
    triggerDownload(url, 'edited_' + state.fileName.replace(/\.[^.]+$/, '') + '.png');
  }

  function triggerDownload(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  // AI 修复背景：把选中文字块区域作为 mask，调用 inpaint 让 AI 去掉文字并补全背景
  async function aiRepairBackground() {
    if (state.selectedBlock == null || !state.ocr) { flash($('editStatus'), '请先选择要修改的文字块', 'err'); return; }
    const s = loadSettings();
    if (!s.apiKey) { flash($('editStatus'), '未配置 API Key，请在右上角“AI 设置”中填写', 'err'); return; }
    const b = state.ocr.words[state.selectedBlock].bbox;
    const invert = s.provider === 'stability';
    const mask = buildMaskForBox(b, invert);
    const imgData = stage().toDataURL('image/png');
    flash($('editStatus'), 'AI 正在修复背景…', 'busy');
    try {
      const out = await callInpaint({
        provider: s.provider, apiKey: s.apiKey, model: s.model, size: s.size,
        prompt: 'Remove the text in the marked region, keep the background natural, seamless, photorealistic. No text.',
        image: imgData, mask
      });
      const im = await dataURLtoCanvas(out);
      // 将 AI 结果缩放绘制回当前画布，保持坐标一致
      const ctx = stage().getContext('2d');
      ctx.clearRect(0, 0, stage().width, stage().height);
      ctx.drawImage(im, 0, 0, stage().width, stage().height);
      drawBlocks();
      flash($('editStatus'), '背景已修复，现在可输入新文字', 'ok');
    } catch (e) {
      flash($('editStatus'), 'AI 修复失败：' + e.message, 'err');
    }
  }

  // 为某个 bbox 生成 mask（透明=要重绘区域；invert=true 时白=要重绘区域）
  function buildMaskForBox(b, invert) {
    const c = newCanvas(state.dispW, state.dispH);
    const x = c.getContext('2d');
    x.fillStyle = invert ? '#000' : '#fff';
    x.fillRect(0, 0, c.width, c.height);
    const rx = b.x0 * state.scale, ry = b.y0 * state.scale;
    const rw = (b.x1 - b.x0) * state.scale, rh = (b.y1 - b.y0) * state.scale;
    if (invert) {
      x.fillStyle = '#fff';
      x.fillRect(rx, ry, rw, rh);
    } else {
      x.globalCompositeOperation = 'destination-out';
      x.fillRect(rx, ry, rw, rh);
    }
    return c.toDataURL('image/png');
  }

  // ---------- 物体替换 ----------
  function replacePanel() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <h3>③ 物体替换 / 自由重绘</h3>
      <p class="muted">在图上用画笔涂抹要替换的区域（红色遮罩），填写描述后由 AI 重绘。原图不会被修改，结果可下载。</p>
      <div class="brush-row" style="margin-top:8px">
        <span class="muted">画笔</span>
        <input type="range" id="brush" min="6" max="120" value="${state.brush}" />
        <button class="btn small" id="clearMask">清空遮罩</button>
      </div>
      <div class="field" style="margin-top:10px">
        <label>替换描述（英文效果最佳，例如：a red sports car）</label>
        <textarea id="prompt" placeholder="a futuristic robot, highly detailed, cinematic lighting"></textarea>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn primary" id="doInpaint">🤖 AI 重绘选中区域</button>
      </div>
      <hr class="sep"/>
      <p class="muted">无需密钥的替代方案：上传一张带透明背景的 PNG，将其粘贴到涂抹区域内。</p>
      <div class="field">
        <label>上传替换图（PNG 透明背景）</label>
        <input type="file" id="pasteImg" accept="image/png,image/*" />
      </div>
      <button class="btn" id="doPaste" style="margin-top:6px">📌 把替换图贴入遮罩区域</button>
      <div class="status" id="repStatus" style="margin-top:10px">就绪</div>
      <div class="result-box" id="resultBox"></div>
      <div class="row" id="repDownloadRow" style="display:none;margin-top:8px">
        <button class="btn primary" id="downloadResult">下载结果图</button>
      </div>
    `;
    setTimeout(() => {
      const ov = overlay();
      ov.onclick = null;
      $('brush').oninput = (e) => { state.brush = parseInt(e.target.value, 10); };
      $('clearMask').onclick = () => { const o = ov.getContext('2d'); o.clearRect(0, 0, ov.width, ov.height); };
      $('doInpaint').onclick = doInpaint;
      $('doPaste').onclick = doPaste;
      $('prompt').value = 'a red sports car, photorealistic';
      attachBrush($('brush'));
    }, 0);
    return wrap;
  }

  // 把显示遮罩放大到原图尺寸，并转成 OpenAI/Stability 需要的 mask
  function buildMaskFromOverlay(invert) {
    const c = newCanvas(state.dispW, state.dispH);
    const x = c.getContext('2d');
    // 白底（OpenAI）或黑底（Stability）
    x.fillStyle = invert ? '#000' : '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(overlay(), 0, 0, c.width, c.height);
    const img = x.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const painted = (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) && d[i + 3] > 10;
      if (invert) {
        // Stability：白色=要重绘区域，黑色=保留
        if (painted) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255; }
        else { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255; }
      } else {
        // OpenAI：透明=要重绘区域
        if (painted) { d[i + 3] = 0; }
        else { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255; }
      }
    }
    x.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }

  async function runInpaint(prompt, statusEl, resultBox, downloadRow, downloadLink, downloadName) {
    if (!prompt) { flash(statusEl, '请填写描述', 'err'); return; }
    const s = loadSettings();
    if (!s.apiKey) { flash(statusEl, '未配置 API Key，请在右上角“AI 设置”中填写', 'err'); return; }
    const invert = s.provider === 'stability';
    const mask = buildMaskFromOverlay(invert);
    const imgData = stage().toDataURL('image/png');
    flash(statusEl, 'AI 正在重绘，请稍候…', 'busy');
    try {
      const out = await callInpaint({
        provider: s.provider, apiKey: s.apiKey, model: s.model, size: s.size,
        prompt, image: imgData, mask
      });
      showResultInto(out, resultBox, downloadRow, downloadLink, downloadName);
      flash(statusEl, '重绘完成', 'ok');
    } catch (e) {
      flash(statusEl, '重绘失败：' + e.message, 'err');
    }
  }
  function doInpaint() {
    const prompt = $('prompt') ? $('prompt').value.trim() : '';
    runInpaint(prompt, $('repStatus'), $('resultBox'), $('repDownloadRow'), $('downloadResult'), 'replace_' + state.fileName.replace(/\.[^.]+$/, '') + '.png');
  }

  // 贴图替换（无需密钥）：把上传的 PNG 缩放到遮罩包围盒内贴入
  function doPaste() {
    const inp = $('pasteImg');
    if (!inp.files || !inp.files[0]) { flash($('repStatus'), '请先选择一张替换图', 'err'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const im = await dataURLtoCanvas(reader.result);
      const o = overlay().getContext('2d');
      const id = o.getImageData(0, 0, overlay().width, overlay().height).data;
      // 计算遮罩包围盒（显示坐标）
      let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
      for (let y = 0; y < overlay().height; y++) {
        for (let x = 0; x < overlay().width; x++) {
          const a = id[(y * overlay().width + x) * 4 + 3];
          if (a > 10) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        }
      }
      if (maxX < 0) { flash($('repStatus'), '请先用画笔涂抹要替换的区域', 'err'); return; }
      const bw = (maxX - minX), bh = (maxY - minY);
      const ctx = stage().getContext('2d');
      ctx.drawImage(im, minX, minY, bw, bh);
      // 清空遮罩
      o.clearRect(0, 0, overlay().width, overlay().height);
      showResult(stage().toDataURL('image/png'));
      flash($('repStatus'), '已贴入替换图', 'ok');
    };
    reader.readAsDataURL(inp.files[0]);
  }

  function showResultInto(dataUrl, box, row, link, name) {
    if (!box) return;
    box.innerHTML = '';
    const im = new Image();
    im.src = dataUrl;
    box.appendChild(im);
    if (row) { row.style.display = 'flex'; link.onclick = () => triggerDownload(dataUrl, name || 'result.png'); }
  }
  function showResult(dataUrl) {
    showResultInto(dataUrl, $('resultBox'), $('repDownloadRow'), $('downloadResult'), 'replace_' + state.fileName.replace(/\.[^.]+$/, '') + '.png');
  }

  // 通用画笔：在当前 overlay 上涂抹遮罩（红），大小由 brushInput 控制
  function attachBrush(brushInput) {
    const ov = overlay();
    let drawing = false;
    const paint = (e) => {
      const { x, y } = toCanvasXY(ov, e);
      const o = ov.getContext('2d');
      o.fillStyle = 'rgba(255,60,90,.55)';
      o.beginPath(); o.arc(x, y, Math.max(3, parseInt(brushInput.value, 10) / 2), 0, Math.PI * 2); o.fill();
    };
    ov.onpointerdown = (e) => { drawing = true; ov.setPointerCapture(e.pointerId); paint(e); };
    ov.onpointermove = (e) => { if (drawing) paint(e); };
    ov.onpointerup = () => { drawing = false; };
    ov.onpointerleave = () => { drawing = false; };
  }

  function wmPanel() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <h3>🧽 去水印</h3>
      <p class="muted">用画笔涂抹水印 / LOGO / 多余文字区域，AI 会将其无缝抹除并补全背景。需 AI Key。</p>
      <div class="brush-row" style="margin-top:8px">
        <span class="muted">画笔</span>
        <input type="range" id="wmBrush" min="6" max="120" value="36" />
        <button class="btn small" id="wmClear">清空涂抹</button>
      </div>
      <div class="field" style="margin-top:10px">
        <label>补充描述（可选，英文更佳）</label>
        <textarea id="wmPrompt" placeholder="例如：keep the original background texture, no trace left"></textarea>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn primary" id="wmRun">✨ AI 去水印</button>
      </div>
      <div class="status" id="wmStatus" style="margin-top:10px">就绪</div>
      <div class="result-box" id="wmResultBox"></div>
      <div class="row" id="wmDownloadRow" style="display:none;margin-top:8px">
        <button class="btn primary" id="wmDownload">下载去水印结果</button>
      </div>
    `;
    setTimeout(() => {
      const ov = overlay();
      $('wmClear').onclick = () => { const o = ov.getContext('2d'); o.clearRect(0, 0, ov.width, ov.height); };
      $('wmRun').onclick = wmRun;
      attachBrush($('wmBrush'));
    }, 0);
    return wrap;
  }
  function wmRun() {
    const prompt = ($('wmPrompt').value.trim()) || 'remove the watermark and text seamlessly, keep the background natural and unchanged';
    runInpaint(prompt, $('wmStatus'), $('wmResultBox'), $('wmDownloadRow'), $('wmDownload'), 'watermark_removed_' + state.fileName.replace(/\.[^.]+$/, '') + '.png');
  }

  // ---------- AI 调用 ----------
  function loadSettings() {
    return {
      provider: localStorage.getItem('it_provider') || 'openai',
      apiKey: localStorage.getItem('it_key') || '',
      model: localStorage.getItem('it_model') || '',
      size: localStorage.getItem('it_size') || '1024x1024',
      mode: localStorage.getItem('it_mode') || 'proxy'
    };
  }
  async function callInpaint(payload) {
    const mode = loadSettings().mode;
    if (mode === 'direct') return await directProvider(payload);
    try {
      const resp = await fetch('/api/inpaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) throw new Error('proxy_status_' + resp.status);
      const j = await resp.json();
      if (!j || !j.result) throw new Error('proxy_empty');
      return j.result;
    } catch (e) {
      // 代理不可用（404/网络/解析失败）→ 自动回退到浏览器直连
      return await directProvider(payload);
    }
  }

  // 浏览器直连 AI（无需服务器）
  function b64blob(dataUrl, type) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
    const b64 = m ? m[2] : dataUrl;
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type });
  }
  function bufToB64(buf) {
    let bin = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  async function directProvider(p) {
    if (p.provider === 'stability') return await directStability(p);
    return await directOpenAI(p);
  }
  async function directOpenAI(p) {
    const form = new FormData();
    form.append('image', b64blob(p.image, 'image/png'), 'image.png');
    form.append('mask', b64blob(p.mask, 'image/png'), 'mask.png');
    form.append('prompt', p.prompt);
    form.append('model', p.model || 'gpt-image-1');
    form.append('size', p.size || '1024x1024');
    form.append('n', '1');
    form.append('response_format', 'b64_json');
    const resp = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${p.apiKey}` }, body: form
    });
    if (!resp.ok) { const t = await resp.text(); throw new Error('OpenAI ' + resp.status + ': ' + t.slice(0, 300)); }
    const j = await resp.json();
    const it = j.data && j.data[0];
    if (!it) throw new Error('OpenAI 返回为空');
    return it.b64_json ? `data:image/png;base64,${it.b64_json}` : it.url;
  }
  async function directStability(p) {
    const form = new FormData();
    form.append('image', b64blob(p.image, 'image/png'), 'image.png');
    form.append('mask', b64blob(p.mask, 'image/png'), 'mask.png');
    form.append('prompt', p.prompt);
    form.append('mode', 'mask');
    form.append('output_format', 'png');
    if (p.model) form.append('model', p.model);
    const resp = await fetch('https://api.stability.ai/v2beta/stable-image/edit/inpaint', {
      method: 'POST', headers: { Authorization: `Bearer ${p.apiKey}`, Accept: 'image/*' }, body: form
    });
    if (!resp.ok) { const t = await resp.text(); throw new Error('Stability ' + resp.status + ': ' + t.slice(0, 300)); }
    const buf = await resp.arrayBuffer();
    return `data:image/png;base64,${bufToB64(buf)}`;
  }

  function flash(elm, msg, cls) {
    if (!elm) return;
    elm.className = 'status' + (cls ? ' ' + cls : '');
    elm.textContent = msg;
  }

  // ---------- 设置弹窗 ----------
  function openSettings() {
    const s = loadSettings();
    el.setProvider.value = s.provider; el.setKey.value = s.apiKey; el.setModel.value = s.model; el.setSize.value = s.size;
    el.setMode.value = s.mode;
    el.settingsModal.hidden = false;
  }
  function saveSettings() {
    localStorage.setItem('it_provider', el.setProvider.value);
    localStorage.setItem('it_key', el.setKey.value.trim());
    localStorage.setItem('it_model', el.setModel.value.trim());
    localStorage.setItem('it_size', el.setSize.value);
    localStorage.setItem('it_mode', el.setMode.value);
    el.settingsModal.hidden = true;
    flash($('editStatus'), 'AI 设置已保存', 'ok');
    flash($('repStatus'), 'AI 设置已保存', 'ok');
  }

  // ---------- 事件绑定 ----------
  function bind() {
    el.file.addEventListener('change', e => loadFile(e.target.files[0]));
    el.changeImg.onclick = () => el.file.click();
    el.drop.addEventListener('dragover', e => { e.preventDefault(); el.drop.classList.add('over'); });
    el.drop.addEventListener('dragleave', () => el.drop.classList.remove('over'));
    el.drop.addEventListener('drop', e => { e.preventDefault(); el.drop.classList.remove('over'); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
    document.querySelectorAll('.tab').forEach(t => t.onclick = () => setTab(t.dataset.tab));
    el.openSettings.onclick = openSettings;
    el.closeSettings.onclick = () => el.settingsModal.hidden = true;
    el.saveSettings.onclick = saveSettings;
    el.settingsModal.addEventListener('click', e => { if (e.target === el.settingsModal) el.settingsModal.hidden = true; });
  }

  function init() { cache(); bind(); }
  document.addEventListener('DOMContentLoaded', init);
})();
