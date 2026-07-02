/* Sizeflow 卖点图生成模块 — SPI (Selling Point Image)
 *
 * 流程：加载 ref-v2.png → AI 识别裤子 → 文案填入固定位置 → 导出 PNG
 * 6 个文字框位置从原图 (1080×1440) 提取的归一化坐标
 */

const SPI = {
  mode: 'annotate',
  canvas: null,
  ctx: null,
  refImage: null,
  textboxes: [],
  sellingPoints: [],
  uploadedImage: null,       // SPI 专属上传图片
  isGenerating: false,
  fontReady: false,
  _drag: null,
  _canvasW: 1080,
  _canvasH: 1600,
  _refW: 1080,
  _refH: 1440,
  _inited: false,

  _offsetY() { return (this._canvasH - this._refH) / 2; },

  // 归一化坐标，基于用户在原图 (1080×1440) 上的测量
  TEXTBOX_REGIONS: [
    { x: 0.6861, y: 0.259,  w: 0.287,  h: 0.125  },  // ① 右上：腰型
    { x: 0.6898, y: 0.3931, w: 0.2972, h: 0.0785 },  // ② 右中上：面料
    { x: 0.663,  y: 0.4813, w: 0.3306, h: 0.2201 },  // ③ 右侧大段：版型总述
    { x: 0.0222, y: 0.534,  w: 0.2491, h: 0.1569 },  // ④ 左侧中部：裤腿版型
    { x: 0.0306, y: 0.7181, w: 0.2593, h: 0.0861 },  // ⑤ 左下：裤腿垂顺
    { x: 0.6741, y: 0.6889, w: 0.3083, h: 0.1257 },  // ⑥ 右下：洗水
  ],

  // ========== 初始化 ==========

  init() {
    if (this._inited) return;
    this._inited = true;
    this.canvas = document.getElementById('spiCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = this._canvasW;
    this.canvas.height = this._canvasH;
    this._loadFont();
    this._loadRef();
    this._buildDlBtn();
    this._bindUI();
  },

  _buildDlBtn() {
    const wrap = document.getElementById('spiCanvasWrap');
    if (!wrap) return;
    const btn = document.createElement('div');
    btn.className = 'spi-dl-overlay';
    btn.title = '下载图片';
    btn.innerHTML = '⬇';
    btn.addEventListener('click', (e) => { e.stopPropagation(); this.exportPNG(); });
    wrap.appendChild(btn);
    this._dlBtn = btn;
  },

  _toggleDlBtn() {
    const hasContent = this.sellingPoints.some(p => p.text && p.text.trim());
    if (this._dlBtn) this._dlBtn.classList.toggle('show', hasContent);
    const wrap = document.getElementById('spiCanvasWrap');
    if (wrap) wrap.classList.toggle('visible', hasContent);
  },

  _loadFont() {
    const font = new FontFace('YShiWrittenSC', 'url(/font/YShiWrittenSC-Regular.ttf)');
    font.load().then(() => { document.fonts.add(font); this.fontReady = true; this.render(); })
      .catch(() => { this.fontReady = false; });
  },

  _loadRef() {
    if (this.refImage) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { this.refImage = img; this._show(); this.render(); };
    img.src = '/static/ref-v2.png';
  },

  // ========== 激活（文案 → 填入） ==========

  activate(copies) {
    if (!copies || copies.length === 0) return;
    const type2 = copies.filter(c => c.type === 2);
    const type1 = copies.filter(c => c.type === 1);
    const points = [];
    if (type2.length > 0) {
      (type2[0].items || []).forEach(item => {
        if (item.title && item.desc) points.push(`${item.title}，${item.desc}`);
        else if (item.title) points.push(item.title);
        else if (item.desc) points.push(item.desc);
      });
    }
    if (type1.length > 0 && points.length < 4) {
      (type1[0].body_a || '').split(/[。，,]/).filter(s => s.trim().length > 4)
        .slice(0, 4).forEach(s => { if (points.length < 6) points.push(s.trim()); });
    }
    while (points.length < 4) points.push('');
    this.sellingPoints = points.slice(0, 6).map(t => ({ text: t }));
    this._initTb();
    this._toggleDlBtn();
    this.render();
    this._show();
  },

  _initTb() {
    const texts = this.sellingPoints.map(sp => sp.text || '');
    this.textboxes = this.TEXTBOX_REGIONS.map((r, i) => ({
      id: i,
      x: r.x, y: r.y, w: r.w, h: r.h,
      text: texts[i] || '',
    }));
  },

  _show() {
    const el = document.getElementById('spiEmpty');
    if (el) el.style.display = 'none';
  },

  // ========== 渲染 ==========

  render() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.fillStyle = '#f7f4ef';
    ctx.fillRect(0, 0, this._canvasW, this._canvasH);
    if (this.refImage) {
      ctx.drawImage(this.refImage, 0, this._offsetY(), this._refW, this._refH);
    }
    this.textboxes.forEach(tb => { if (tb.text) this._drawTb(ctx, tb); });
  },

  _drawTb(ctx, tb) {
    const x = tb.x * this._canvasW;
    const y = tb.y * this._refH + this._offsetY();
    const w = tb.w * this._canvasW;
    const h = tb.h * this._refH;
    const padX = w * 0.08, padY = h * 0.10;
    const maxTW = w - padX * 2, maxTH = h - padY * 2;
    const font = this.fontReady ? '"YShiWrittenSC","STKaiti","KaiTi",serif' : 'sans-serif';

    // 二分查找最大字号
    let lo = 12, hi = 28, best = 12, bestLines = [tb.text];
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      ctx.font = `${mid}px ${font}`;
      const lines = this._wrap(ctx, tb.text, maxTW);
      if (lines.length * mid * 1.45 <= maxTH) { best = mid; bestLines = lines; lo = mid + 1; }
      else { hi = mid - 1; }
    }

    const lh = best * 1.45;
    const th = bestLines.length * lh;
    const bh = Math.max(th + padY * 2, h * 0.35);
    const r = Math.min(6, w * 0.03);

    // 文字（加微弱阴影提升可读性，无背景框）
    ctx.fillStyle = '#1a1a1a';
    ctx.shadowColor = 'rgba(255,255,255,0.7)';
    ctx.shadowBlur = 3;
    ctx.font = `${best}px ${font}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    bestLines.forEach((line, i) => {
      ctx.fillText(line, x + padX, y + (bh - th) / 2 + i * lh);
    });
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  },

  // ========== 交互 ==========

  _bindEvents() {
    const c = this.canvas;
    if (!c) return;
    c.addEventListener('mousedown', e => this._dn(e));
    c.addEventListener('mousemove', e => this._mv(e));
    c.addEventListener('mouseup', () => this._up());
    c.addEventListener('dblclick', e => this._db(e));
    c.addEventListener('contextmenu', e => { e.preventDefault(); const h = this._hit(this._gp(e)); if (h) { h.text = ''; this._toggleDlBtn(); this.render(); } });
    c.addEventListener('touchstart', e => { e.preventDefault(); this._dn(e.touches[0]); }, { passive: false });
    c.addEventListener('touchmove', e => { e.preventDefault(); this._mv(e.touches[0]); }, { passive: false });
    c.addEventListener('touchend', () => this._up());
  },

  _gp(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (this._canvasW / r.width), y: (e.clientY - r.top) * (this._canvasH / r.height) };
  },

  _hit(p) {
    const oY = this._offsetY();
    for (let i = this.textboxes.length - 1; i >= 0; i--) {
      const tb = this.textboxes[i];
      if (p.x >= tb.x * this._canvasW && p.x <= (tb.x + tb.w) * this._canvasW &&
          p.y >= tb.y * this._refH + oY && p.y <= (tb.y + tb.h) * this._refH + oY) return tb;
    }
    return null;
  },

  _dn(e) {
    const p = this._gp(e), h = this._hit(p);
    if (h) {
      this._drag = { tb: h, ox: p.x - h.x * this._canvasW, oy: p.y - (h.y * this._refH + this._offsetY()) };
      this.canvas.style.cursor = 'grabbing';
    }
  },

  _mv(e) {
    if (this._drag) {
      const p = this._gp(e), tb = this._drag.tb;
      tb.x = Math.max(0, Math.min(1 - tb.w, (p.x - this._drag.ox) / this._canvasW));
      tb.y = Math.max(0, Math.min(1 - tb.h, (p.y - this._drag.oy - this._offsetY()) / this._refH));
      this.render();
    } else {
      this.canvas.style.cursor = this._hit(this._gp(e)) ? 'grab' : 'default';
    }
  },

  _up() { this._drag = null; this.canvas.style.cursor = 'default'; },

  _db(e) {
    const h = this._hit(this._gp(e));
    if (h) { const t = prompt('编辑文案:', h.text); if (t !== null) { h.text = t.trim(); this._toggleDlBtn(); this.render(); } }
  },

  // ========== 导出 ==========

  exportPNG() {
    if (!this.canvas) return;
    const hasContent = this.sellingPoints.some(p => p.text && p.text.trim());
    if (!hasContent) {
      if (typeof toast === 'function') toast('请先点击「AI 一键生成」生成卖点图', 'error');
      return;
    }
    const a = document.createElement('a');
    a.download = `卖点图_${new Date().toISOString().slice(0, 10)}.png`;
    a.href = this.canvas.toDataURL('image/png');
    a.click();
  },

  // ========== AI 一键生成 ==========

  async autoGenerate() {
    if (this.isGenerating) return;
    const btn = document.getElementById('spiGen');
    const st = document.getElementById('spiStatus');
    this.isGenerating = true;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ AI 分析中...'; }
    if (st) st.textContent = 'AI 正在识别裤子特征...';

    // Prefer SPI's own upload, fall back to CW's product image
    let img = this.uploadedImage || (CW && CW.productImages && CW.productImages[0]) || '';
    if (!img) {
      this.isGenerating = false;
      if (btn) { btn.disabled = false; btn.textContent = '🎨 AI 一键生成卖点图'; }
      if (typeof toast === 'function') toast('请先上传裤子照片', 'error');
      return;
    }

    try {
      // 腰型强制上游（已有识别/手动选过，已在 activate 时保证）
      const waistLabel = (CW && CW.waistInfo && CW.waistInfo.waist_type) || '';
      if (!waistLabel || waistLabel === '未知') {
        this.isGenerating = false;
        if (btn) { btn.disabled = false; btn.textContent = '🎨 AI 一键生成卖点图'; }
        if (typeof toast === 'function') toast('请先在文案板块识别尺码表或手动选择腰型', 'error');
        return;
      }

      // 尺码表原表 + 模型
      const sizeData = (CW && CW.sizeData && CW.sizeData.headers) ? CW.sizeData : {};
      const modelSel = document.getElementById('spiModel');
      const model = modelSel ? modelSel.value : 'qwen3.7-plus';

      const r1 = await fetch('/api/spi/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: img, size_data: sizeData, waist_label: waistLabel, model: model }),
      });
      const d1 = await r1.json();
      if (!d1.success) throw new Error(d1.error || '启动失败');

      const tid = d1.task_id;
      if (st) st.textContent = 'AI 正在生成卖点文案...';

      for (let i = 0; i < 180; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const r2 = await fetch(`/api/spi/poll/${tid}`);
        const d2 = await r2.json();

        if (d2.status === 'done') {
          if (d2.result && d2.result.selling_points) {
            this.sellingPoints = d2.result.selling_points;
            this._initTb();
            this._toggleDlBtn();
            this.render();
            this._expand();
            const dbgEl = document.getElementById('spiDebug');
            if (dbgEl) {
              let txt = '\n\n=== 最终卖点文案 ===\n' + d2.result.selling_points.map((s,i) => `${i+1}. ${s.text || '(空)'}`).join('\n');
              if (d2.result.debug) {
                const dbg = d2.result.debug;
                txt = '\n\n=== AI视觉分析提示词 ===\n' + (dbg.r1_prompt || '') +
                      '\n\n=== 照片特征提取结果 ===\n' + JSON.stringify(dbg.r1_manifest || {}, null, 2) +
                      '\n\n=== 文案生成原始输出 ===\n' + (dbg.r2_raw || '') +
                      '\n\n=== 生成统计 ===\n重试次数: ' + (dbg.retries || 0) + ' | 数字过滤兜底: ' + (dbg.leaks_cleaned ? '是' : '否') +
                      txt;
              }
              dbgEl.textContent = (dbgEl.textContent || '') + txt;
            }
          }
          if (st) st.textContent = '✅ 生成完成！可拖拽文字框调整位置';
          if (typeof toast === 'function') toast('卖点图生成完成！', 'success');
          break;
        }
        if (d2.status === 'error') {
          if (d2.selling_points && d2.selling_points.length > 0) {
            this.sellingPoints = d2.selling_points;
            this._initTb();
            this._toggleDlBtn();
            this.render();
          }
          if (st) st.textContent = '⚠️ ' + (d2.error || '部分失败');
          break;
        }
      }
    } catch (e) {
      console.error('[SPI] 失败:', e);
      if (st) st.textContent = '❌ ' + e.message;
      if (typeof toast === 'function') toast('生成失败: ' + e.message, 'error');
    } finally {
      this.isGenerating = false;
      if (btn) { btn.disabled = false; btn.textContent = '🎨 AI 一键生成卖点图'; }
    }
  },

  // ========== UI 绑定 ==========

  _handleUpload(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      this.uploadedImage = ev.target.result;
      const hint = document.getElementById('spiUploadHint');
      const preview = document.getElementById('spiUploadPreview');
      if (hint) hint.style.display = 'none';
      if (preview) { preview.src = ev.target.result; preview.style.display = 'block'; }
      if (typeof toast === 'function') toast('照片已上传', 'success');
      this._updateDebug();
    };
    reader.readAsDataURL(file);
  },

  _updateDebug() {
    const el = document.getElementById('spiDebug');
    if (!el || el.style.display === 'none') return;
    const waistLabel = (CW && CW.waistInfo && CW.waistInfo.waist_type) || '';
    const hasWaist = waistLabel && waistLabel !== '未知';
    const hasSizeData = CW && CW.sizeData && CW.sizeData.headers;
    const hasImg = this.uploadedImage || (CW && CW.productImages && CW.productImages[0]);
    const modelSel = document.getElementById('spiModel');
    const model = modelSel ? modelSel.value : 'qwen3.7-plus';

    const issues = [];
    if (!hasImg) issues.push('NO PHOTO');
    if (!hasWaist) issues.push('NO WAIST (will fail)');
    if (!hasSizeData) issues.push('NO SIZE TABLE (will pass empty)');

    el.textContent =
      '=== ' + (issues.length ? issues.join(', ') : 'ALL OK') + ' ===\n\n' +
      'AI视觉分析: qwen3-vl-flash 从照片提取5个部位特征\n' +
      '  (腰型由上游尺码表提供，不在此分析)\n' +
      '  → 胯部 / 版型总述 / 裤管版型 / 裤腿线条 / 颜色面料\n' +
      '  每部位输出: 视觉证据 + 分类 + 置信度\n\n' +
      '文案生成: ' + model + ' 融合特征 + 尺码表 + 腰型 → 6 槽文案\n' +
      '  每槽独立字数预算 · 数字检测 ≤3 次重试\n\n' +
      '腰型: ' + (hasWaist ? waistLabel : '❌ 缺失-将拦截') + '\n' +
      '尺码表: ' + (hasSizeData ? CW.sizeData.headers.length + '列 × ' + CW.sizeData.rows.length + '行' : '无') + '\n' +
      '照片: ' + (hasImg ? '已上传' : '❌ 缺失') + '\n\n' +
      '(完整提示词 + 特征提取 + 原始输出 生成后可见)';
  },

  _expand() {
    this.canvas?.classList.add('expanded');
    const btn = document.getElementById('spiExpand');
    if (btn) btn.textContent = '🔍 缩小';
  },
  _collapse() {
    this.canvas?.classList.remove('expanded');
    const btn = document.getElementById('spiExpand');
    if (btn) btn.textContent = '🔍 展开';
  },

  _bindUI() {
    this._bindEvents();

    // Upload slot
    const slot = document.getElementById('spiUploadSlot');
    const fileIn = document.getElementById('spiFileInput');
    if (slot && fileIn) {
      slot.addEventListener('click', () => fileIn.click());
      slot.addEventListener('dragover', e => { e.preventDefault(); slot.style.borderColor = 'rgba(100,180,255,.5)'; });
      slot.addEventListener('dragleave', () => { slot.style.borderColor = 'rgba(255,255,255,.15)'; });
      slot.addEventListener('drop', e => {
        e.preventDefault(); slot.style.borderColor = 'rgba(255,255,255,.15)';
        const f = e.dataTransfer.files[0]; if (f) this._handleUpload(f);
      });
      fileIn.addEventListener('change', e => {
        const f = e.target.files[0]; if (f) this._handleUpload(f);
      });
    }

    document.getElementById('spiGen')?.addEventListener('click', () => this.autoGenerate());
    document.getElementById('spiExport')?.addEventListener('click', () => this.exportPNG());
    document.getElementById('spiReset')?.addEventListener('click', () => { this._initTb(); this._toggleDlBtn(); this.render(); this._collapse(); });
    let _debugTimer = null;
    document.getElementById('spiDebugBtn')?.addEventListener('click', () => {
      const el = document.getElementById('spiDebug');
      if (!el) return;
      if (el.style.display === 'none') {
        el.style.display = 'block';
        this._updateDebug();
        _debugTimer = setInterval(() => this._updateDebug(), 1500);
      } else {
        el.style.display = 'none';
        clearInterval(_debugTimer);
        _debugTimer = null;
      }
    });
    // 展开/缩小切换
    document.getElementById('spiExpand')?.addEventListener('click', () => {
      const expanded = this.canvas.classList.toggle('expanded');
      const btn = document.getElementById('spiExpand');
      if (btn) btn.textContent = expanded ? '🔍 缩小' : '🔍 展开';
    });
  },

  // ========== 工具 ==========

  _rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  _wrap(ctx, text, mw) {
    if (!text) return [];
    const ls = []; let cur = '';
    for (let i = 0; i < text.length; i++) {
      const t = cur + text[i];
      if (ctx.measureText(t).width > mw && cur) { ls.push(cur); cur = text[i]; }
      else { cur = t; }
    }
    if (cur) ls.push(cur);
    return ls;
  },
};

// ========== 文案说明弹窗 ==========
function showGuide() {
  if (localStorage.getItem('spi_guide_hidden')) return;
  const el = document.getElementById('guideOverlay');
  if (el) el.classList.add('show');
}
function dismissGuide() {
  const el = document.getElementById('guideOverlay');
  if (el) el.classList.remove('show');
  const cb = document.getElementById('guideNoMore');
  if (cb && cb.checked) localStorage.setItem('spi_guide_hidden', '1');
}

// 字体加载后初始化
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => SPI.init());
}
