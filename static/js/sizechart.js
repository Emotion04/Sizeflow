/* Sizeflow 尺码表工具 — 主逻辑 JS
   提取自 index.html (原 lines 778-2837 + 2879-2896) */

// ======== State ========
let currentImage = null;   // base64 data URI or file path string
let currentImageB64 = null; // always base64 for preview
let resultData = null;
let mappings = {};

let currentModel = 'qwen3.6-plus';

// 导出列宽状态
let exportColWidth = 155;
let exportColWidths = {};  // {colIndex: px} 逐列覆盖
// 导出行高状态
let exportRowHeight = 72;
let exportRowHeights = {};  // {rowIndex: px} 逐行覆盖
let exportHeaderHeight = 72;
// 字体字重
let currentFontWeight = 'medium';
// 字号
let currentFontSize = 20;
let currentHeaderFontSize = 24;
// 导出配置
let exportConfig = { bgWidth: 1200, bgHeight: 0, padding: 55 };
// 配置预设
const PRESETS_KEY = 'sizeflow_presets';
let presets = [];
// 选区状态
let selectionStart = null;   // {row, col}
let selectionEnd = null;     // {row, col}
let isSelecting = false;
let selectedColumns = new Set();  // 复选框选中的列索引

// ======== Init ========
async function init() {
  await Promise.all([loadMappings(), loadModels(), loadKeyStatus(), loadTemplates(), loadWallpaperList(), checkAppUpdate(), loadChangelog(), loadPresets(), loadSCSessions()]);
  // 恢复上次壁纸，没有则默认"晨雾"莫兰迪渐变
  const wp = loadWallpaper();
  if (wp) {
    applyWallpaper(wp);
  } else {
    const mist = GRADIENT_WALLPAPERS[0]; // 晨雾
    const defaultWp = { id: mist.id, url: mist.css, name: mist.name, type: 'gradient' };
    saveWallpaper(defaultWp);
    applyWallpaper(defaultWp);
  }
  bindEvents();
}

async function loadKeyStatus() {
  try {
    const r = await fetch('/api/key');
    const d = await r.json();
    const st = document.getElementById('keyStatus');
    if (d.has_key) {
      document.getElementById('apiKeyInput').placeholder = 'API Key 已配置';
      st.textContent = '✓';
      st.style.color = 'var(--success)';
    } else {
      st.textContent = '未设置';
      st.style.color = 'var(--danger)';
    }
  } catch (e) {}
}

async function loadMappings() {
  try {
    const r = await fetch('/api/mappings');
    const d = await r.json();
    mappings = d.mappings;
    renderMappings();
  } catch (e) {
    toast('加载映射配置失败: ' + e.message, 'error');
  }
}

async function loadModels() {
  try {
    const r = await fetch('/api/model');
    const d = await r.json();
    currentModel = d.model;
    const sel = document.getElementById('modelSelect');
    sel.innerHTML = d.models.map(m =>
      `<option value="${m.id}" ${m.id === d.model ? 'selected' : ''}>${m.name} - ${m.desc}</option>`
    ).join('');
    sel.addEventListener('change', async () => {
      currentModel = sel.value;
      await fetch('/api/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: currentModel })
      });
      toast(`已切换到: ${sel.options[sel.selectedIndex].text}`, 'info');
    });
  } catch (e) {
    toast('加载模型列表失败: ' + e.message, 'error');
  }
}

let _allCommits = [];
let _changelogExpanded = false;
const CHANGELOG_CACHE_KEY = 'sizeflow_changelog';

async function loadChangelog() {
  const list = document.getElementById('changelogList');
  if (list) list.innerHTML = '<span style="opacity:.5;">加载中...</span>';

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('/api/changelog', { signal: ctrl.signal });
    clearTimeout(timeout);
    const d = await r.json();
    if (d.success && d.commits.length) {
      _allCommits = d.commits;
      try { localStorage.setItem(CHANGELOG_CACHE_KEY, JSON.stringify(d.commits)); } catch(e) {}
      renderChangelog();
      return;
    }
  } catch(e) {}

  // 超时或失败，回退localStorage缓存
  try {
    const cached = localStorage.getItem(CHANGELOG_CACHE_KEY);
    if (cached) {
      _allCommits = JSON.parse(cached);
      renderChangelog();
      return;
    }
  } catch(e) {}

  if (list) list.innerHTML = '<span style="opacity:.4;">暂无更新日志</span>';
}

function timeAgo(ts) {
  var diff = Math.max(0, Math.floor(Date.now()/1000) - ts);
  if (diff < 3600) return Math.max(1, Math.floor(diff/60)) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff/3600) + ' 小时前';
  if (diff < 2592000) return Math.floor(diff/86400) + ' 天前';
  return Math.floor(diff/2592000) + ' 个月前';
}

function renderChangelog() {
  const list = document.getElementById('changelogList');
  const btn = document.getElementById('changelogMoreBtn');
  if (!list) return;
  const show = _changelogExpanded ? _allCommits : _allCommits.slice(0, 3);
  list.innerHTML = show.map(function(c, i) {
    var idx = _changelogExpanded ? i : i;
    return '<div style="margin-bottom:3px;"><b style="color:var(--text);">' + esc(c.hash) + '</b> <span class="cl-date" data-ts="' + c.date + '" style="opacity:.6;">' + timeAgo(parseInt(c.date)||0) + '</span><br>' + esc(c.msg) + '</div>';
  }).join('');
  if (_allCommits.length > 3) {
    btn.classList.remove('hidden');
    btn.textContent = _changelogExpanded ? '收起 ▴' : '展开更多 ▾ (' + (_allCommits.length - 3) + '条)';
  }
}

// 每 30 秒刷新更新日志的相对时间
function refreshChangelogTimes() {
  document.querySelectorAll('.cl-date').forEach(function(el) {
    var ts = parseInt(el.getAttribute('data-ts')) || 0;
    if (ts) el.textContent = timeAgo(ts);
  });
}
setInterval(refreshChangelogTimes, 3600000);

async function checkAppUpdate() {
  try {
    const r = await fetch('/api/check-update');
    const d = await r.json();
    if (!d.has_update) return;
    const banner = document.getElementById('updateBanner');
    const text = document.getElementById('updateText');
    text.innerHTML = `发现新版本 <b>${d.latest}</b>（当前 ${d.current}），建议更新。`;
    banner.classList.add('show');
    document.getElementById('btnDownloadUpdate').onclick = () => {
      fetch('/api/open-download', { method: 'POST' });
      window.open(d.url, '_blank');
    };
    document.getElementById('btnCloseUpdate').onclick = () => {
      banner.classList.remove('show');
    };
  } catch (e) { /* 静默失败 */ }
}

function renderMappings(highlightKey) {
  const list = document.getElementById('mappingList');
  list.innerHTML = Object.entries(mappings).map(([k, v], i) =>
    `<div class="mapping-row ${k === highlightKey ? 'mapping-new' : ''}">
      <input class="key-input" value="${esc(k)}" data-idx="${i}" data-field="key" placeholder="工厂表头">
      <span class="arrow">&rarr;</span>
      <input value="${esc(v)}" data-idx="${i}" data-field="val" placeholder="用户表头">
      <button class="btn btn-danger btn-sm" data-idx="${i}" data-action="del" title="删除">&times;</button>
    </div>`
  ).join('');
  // 滚动到底部
  list.scrollTop = list.scrollHeight;
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ======== Events ========
function bindEvents() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  document.addEventListener('paste', e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        handleFile(item.getAsFile());
        break;
      }
    }
  });

  document.getElementById('clearImgBtn').addEventListener('click', clearImage);
  document.getElementById('loadPathBtn').addEventListener('click', loadFromPath);
  document.getElementById('filePathInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadFromPath();
  });

  document.getElementById('analyzeBtn').addEventListener('click', analyze);
  // DEBUG: 快速调试按钮
  document.getElementById('debugAnalyzeBtn').addEventListener('click', debugAnalyze);

  document.getElementById('addMappingBtn').addEventListener('click', addMapping);
  document.getElementById('resetMappingsBtn').addEventListener('click', resetMappings);
  document.getElementById('saveMappingsBtn').addEventListener('click', saveMappings);

  document.getElementById('mappingList').addEventListener('change', onMappingEdit);
  document.getElementById('mappingList').addEventListener('click', onMappingClick);

  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.getElementById('copyTableBtn').addEventListener('click', copyTable);
  document.getElementById('addRowBtn').addEventListener('click', addRow);
  document.getElementById('addColBtn').addEventListener('click', addCol);

  // API Key
  document.getElementById('saveKeyBtn').addEventListener('click', saveApiKey);
  document.getElementById('apiKeyInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveApiKey();
  });

  // Column width control
  const slider = document.getElementById('colWidthSlider');
  const input = document.getElementById('colWidthInput');
  slider.addEventListener('input', () => { input.value = slider.value; applyColWidth(slider.value); });
  input.addEventListener('input', () => { slider.value = input.value; applyColWidth(input.value); });
  input.addEventListener('change', () => { if (resultData) renderTable(resultData); });

  // Style export
  document.getElementById('exportPngBtn').addEventListener('click', exportPng);

  // 导出配置面板
  document.getElementById('exportConfigToggle').addEventListener('click', function() {
    const panel = document.getElementById('exportConfigPanel');
    panel.classList.toggle('hidden');
    this.textContent = panel.classList.contains('hidden') ? '导出配置 ▸' : '导出配置 ▾';
  });
  document.getElementById('cfgApplyBtn').addEventListener('click', function() {
    exportConfig.bgWidth = parseInt(document.getElementById('cfgBgWidth').value) || 1200;
    exportConfig.bgHeight = parseInt(document.getElementById('cfgBgHeight').value) || 0;
    exportConfig.padding = parseInt(document.getElementById('cfgPadding').value) || 55;
    document.getElementById('cfgBgWidth').value = exportConfig.bgWidth;
    document.getElementById('cfgBgHeight').value = exportConfig.bgHeight;
    document.getElementById('cfgPadding').value = exportConfig.padding;
    // 校验：背景宽/高不能小于表格+留白
    updateTableSizeIndicator();
    checkExportConfigWarning();
    refreshPreview();
    toast('导出配置已应用', 'info');
  });

  function updateTableSizeIndicator() {
    const el = document.getElementById('tableSizeIndicator');
    if (!resultData || !resultData.headers) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const pad = exportConfig.padding || 55;
    const nCols = resultData.headers.length;
    let totalColW = 0;
    for (let i = 0; i < nCols; i++) {
      totalColW += (exportColWidths[i] !== undefined ? exportColWidths[i] : exportColWidth);
    }
    const nRows = resultData.rows.length;
    let totalRowH = exportHeaderHeight;
    for (let i = 0; i < nRows; i++) {
      totalRowH += (exportRowHeights[i] !== undefined ? exportRowHeights[i] : exportRowHeight);
    }
    const imgW = Math.max(exportConfig.bgWidth || 1200, totalColW + 2 * pad);
    const imgH = Math.max(exportConfig.bgHeight || 0, totalRowH + 2 * pad) || (totalRowH + 2 * pad);
    const marginLR = Math.max(0, (imgW - totalColW - 2 * pad)) / 2 + pad;
    const marginTB = Math.max(0, (imgH - totalRowH - 2 * pad)) / 2 + pad;
    el.innerHTML = `表格净尺寸 ${totalColW} × ${totalRowH} px | ` +
      `图片 ${imgW} × ${imgH} px | ` +
      `四边留白: 左${Math.round(marginLR)} 右${Math.round(marginLR)} 上${Math.round(marginTB)} 下${Math.round(marginTB)} px`;
  }

  function checkExportConfigWarning() {
    const warnEl = document.getElementById('cfgWarning');
    if (!resultData || !resultData.headers) { warnEl.style.display = 'none'; return; }
    const pad = exportConfig.padding || 55;
    if (pad < 0) { warnEl.textContent = '⚠ 留白不能为负数'; warnEl.style.display = 'inline'; return; }
    const nCols = resultData.headers.length;
    // 与服务端完全相同的公式：总列宽 = 所有列的宽度之和(默认155px)
    let totalColW = 0;
    for (let i = 0; i < nCols; i++) {
      totalColW += (exportColWidths[i] !== undefined ? exportColWidths[i] : exportColWidth);
    }
    // needW = 列宽总和 + 2×留白（与服务端 actual_w = max(bgWidth, needW) 一致）
    const needW = totalColW + 2 * pad;
    // needH = header行高 + 数据行 × 行高 + 2×留白
    const nRows = resultData.rows.length;
    let totalRowH = exportHeaderHeight;
    for (let i = 0; i < nRows; i++) {
      totalRowH += (exportRowHeights[i] !== undefined ? exportRowHeights[i] : exportRowHeight);
    }
    const needH = totalRowH + 2 * pad;
    const bgW = exportConfig.bgWidth || 1200;
    const bgH = exportConfig.bgHeight || 0;
    const actualW = Math.max(bgW, needW);
    const actualH = bgH > 0 ? Math.max(bgH, needH) : needH;
    const msgs = [];
    if (bgW < 1) msgs.push('背景宽无效，已自动使用最小值');
    else if (bgW < needW) msgs.push(`背景宽${bgW}太小，最小需${needW}，已自动扩至${actualW}px`);
    if (bgH > 0 && bgH < needH) msgs.push(`背景高${bgH}太小，最小需${needH}，已自动扩至${actualH}px`);
    if (msgs.length > 0) {
      warnEl.textContent = '⚠ ' + msgs.join('；');
      warnEl.style.display = 'inline';
    } else {
      warnEl.style.display = 'none';
    }
  }

  // 导出配置输入框变化时也触发警告
  ['cfgBgWidth','cfgPadding','cfgBgHeight'].forEach(id => {
    document.getElementById(id).addEventListener('input', checkExportConfigWarning);
  });

  // 字体字重选择
  document.getElementById('fontWeightSelect').addEventListener('change', function() {
    currentFontWeight = this.value;
    refreshPreview();
  });
  // 字号选择
  // 内容字号
  const fontSizeSlider = document.getElementById('fontSizeSlider');
  const fontSizeInput = document.getElementById('fontSizeInput');
  const fontSizePreview = document.getElementById('fontSizePreview');
  function applyFontSize(v) {
    v = Math.max(5, Math.min(52, parseInt(v) || 20));
    currentFontSize = v;
    fontSizeSlider.value = v;
    fontSizeInput.value = v;
    fontSizePreview.style.fontSize = v + 'px';
  }
  fontSizeSlider.addEventListener('input', function() {
    applyFontSize(this.value);
  });
  fontSizeSlider.addEventListener('change', function() {
    applyFontSize(this.value);
    refreshPreview();
  });
  fontSizeInput.addEventListener('change', function() {
    applyFontSize(this.value);
    refreshPreview();
  });

  // 表头字号
  const headerFontSizeSlider = document.getElementById('headerFontSizeSlider');
  const headerFontSizeInput = document.getElementById('headerFontSizeInput');
  const headerFontSizePreview = document.getElementById('headerFontSizePreview');
  function applyHeaderFontSize(v) {
    v = Math.max(5, Math.min(52, parseInt(v) || 24));
    currentHeaderFontSize = v;
    headerFontSizeSlider.value = v;
    headerFontSizeInput.value = v;
    headerFontSizePreview.style.fontSize = v + 'px';
  }
  headerFontSizeSlider.addEventListener('input', function() {
    applyHeaderFontSize(this.value);
  });
  headerFontSizeSlider.addEventListener('change', function() {
    applyHeaderFontSize(this.value);
    refreshPreview();
  });
  headerFontSizeInput.addEventListener('change', function() {
    applyHeaderFontSize(this.value);
    refreshPreview();
  });

  // 选区复制按钮
  document.getElementById('copySelectionImgBtn').addEventListener('click', copySelectionAsImage);
  document.getElementById('copySelectionTextBtn').addEventListener('click', copySelectionAsText);

  // 更新日志展开
  document.getElementById('changelogMoreBtn').addEventListener('click', () => {
    _changelogExpanded = !_changelogExpanded;
    renderChangelog();
  });

  // 导出列宽控制 — 拖动即时生效（直接改 iframe 的 <colgroup>）
  document.getElementById('exportColWidthSlider').addEventListener('input', function() {
    exportColWidth = parseInt(this.value);
    document.getElementById('exportColWidthInput').value = exportColWidth;
    exportColWidths = {};
    refreshFineTunePanel();
    applyExportColWidths();
    updateTableSizeIndicator();
  });
  document.getElementById('exportColWidthInput').addEventListener('change', function() {
    exportColWidth = parseInt(this.value) || 155;
    document.getElementById('exportColWidthSlider').value = exportColWidth;
    exportColWidths = {};
    refreshFineTunePanel();
    applyExportColWidths();
  });
  document.getElementById('fineTuneBtn').addEventListener('click', function() {
    const panel = document.getElementById('fineTunePanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) refreshFineTunePanel();
    this.textContent = panel.classList.contains('hidden') ? '微调列宽 ▾' : '微调列宽 ▴';
  });

  // 导出行高控制 — 拖动即时生效（直接改 iframe 的 th/td inline style）
  document.getElementById('exportRowHeightSlider').addEventListener('input', function() {
    exportRowHeight = parseInt(this.value);
    document.getElementById('exportRowHeightInput').value = exportRowHeight;
    exportRowHeights = {};
    refreshFineTuneRowPanel();
    applyExportRowHeights();
  });
  document.getElementById('exportRowHeightInput').addEventListener('change', function() {
    exportRowHeight = parseInt(this.value) || 72;
    document.getElementById('exportRowHeightSlider').value = exportRowHeight;
    exportRowHeights = {};
    refreshFineTuneRowPanel();
    applyExportRowHeights();
  });
  // 表头行高
  document.getElementById('exportHeaderHeightSlider').addEventListener('input', function() {
    exportHeaderHeight = parseInt(this.value);
    document.getElementById('exportHeaderHeightInput').value = exportHeaderHeight;
    applyExportRowHeights();
  });
  document.getElementById('exportHeaderHeightInput').addEventListener('change', function() {
    exportHeaderHeight = parseInt(this.value) || 72;
    document.getElementById('exportHeaderHeightSlider').value = exportHeaderHeight;
    applyExportRowHeights();
  });
  document.getElementById('fineTuneRowBtn').addEventListener('click', function() {
    const panel = document.getElementById('fineTuneRowPanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) refreshFineTuneRowPanel();
    this.textContent = panel.classList.contains('hidden') ? '微调行高 ▾' : '微调行高 ▴';
  });

  // Wallpaper panel toggle
  document.getElementById('wallpaperBtn').addEventListener('click', () => {
    const panel = document.getElementById('wallpaperPanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) loadWallpaperList();
  });
  // Close panel on outside click
  document.addEventListener('click', e => {
    const panel = document.getElementById('wallpaperPanel');
    if (!panel.classList.contains('hidden') && !panel.contains(e.target) && e.target.id !== 'wallpaperBtn') {
      panel.classList.add('hidden');
    }
  });

  // 配置预设事件
  document.getElementById('savePresetBtn').addEventListener('click', savePreset);
  document.getElementById('loadPresetBtn').addEventListener('click', loadPreset);
  document.getElementById('deletePresetBtn').addEventListener('click', deletePreset);
  document.getElementById('exportPresetsBtn').addEventListener('click', exportPresets);
  document.getElementById('importPresetsBtn').addEventListener('click', importPresets);
  document.getElementById('presetFileInput').addEventListener('change', function(e) {
    if (e.target.files[0]) handlePresetFileImport(e.target.files[0]);
    e.target.value = '';
  });
}

async function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) return toast('请输入 API Key', 'error');
  try {
    const r = await fetch('/api/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key })
    });
    const d = await r.json();
    if (d.success) {
      document.getElementById('apiKeyInput').value = '';
      document.getElementById('apiKeyInput').placeholder = 'API Key 已配置';
      document.getElementById('keyStatus').textContent = '✓';
      document.getElementById('keyStatus').style.color = 'var(--success)';
      toast('API Key 已保存', 'success');
    }
  } catch (e) {
    toast('保存失败: ' + e.message, 'error');
  }
}

// ======== Image handling ========
// 图片压缩阈值：小于此值不压缩 (500KB)
const COMPRESS_THRESHOLD = 500 * 1024;
const MAX_IMAGE_WIDTH = 1500;
const JPEG_QUALITY = 0.85;

function handleFile(file) {
  if (file.size <= COMPRESS_THRESHOLD) {
    // 小图片直接读
    const reader = new FileReader();
    reader.onload = () => {
      currentImageB64 = reader.result;
      currentImage = reader.result;
      showPreview(reader.result);
    };
    reader.readAsDataURL(file);
    return;
  }
  // 大图片压缩后再发
  compressImage(file, MAX_IMAGE_WIDTH, JPEG_QUALITY, (b64) => {
    currentImageB64 = b64;
    currentImage = b64;
    showPreview(b64);
  });
}

function compressImage(file, maxW, quality, callback) {
  const img = new Image();
  img.onload = () => {
    let w = img.width, h = img.height;
    if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', quality));
    toast(`图片已压缩: ${(file.size/1024).toFixed(0)}KB → ${(canvas.toDataURL('image/jpeg', quality).length*3/4/1024).toFixed(0)}KB`, 'info');
  };
  img.src = URL.createObjectURL(file);
}

function loadFromPath() {
  const path = document.getElementById('filePathInput').value.trim();
  if (!path) return toast('请输入文件路径', 'error');

  // For local file paths, we send the path string to the server
  // No base64 preview available — we show a placeholder
  currentImage = path;
  currentImageB64 = null;

  // Try to show preview via a simple trick: use file:// URL (may not work in all browsers)
  document.getElementById('noPreview').classList.add('hidden');
  const wrap = document.getElementById('previewWrap');
  wrap.classList.remove('hidden');
  document.getElementById('previewImg').src = '';

  // Show path as text in preview area
  const img = document.getElementById('previewImg');
  img.alt = `文件路径: ${path}`;
  img.style.display = 'none';
  // Simple placeholder
  if (!document.getElementById('pathPlaceholder')) {
    const div = document.createElement('div');
    div.id = 'pathPlaceholder';
    div.style.cssText = 'padding:40px;color:var(--text2);font-size:14px;';
    wrap.appendChild(div);
  }
  const ph = document.getElementById('pathPlaceholder');
  ph.innerHTML = `&#128194; 使用文件路径模式<br><small>${esc(path)}</small>`;
  ph.style.display = '';

  document.getElementById('analyzeBtn').disabled = false;
  document.getElementById('analyzeHint').textContent = '';
  toast('已加载文件路径', 'info');
}

function showPreview(src) {
  document.getElementById('noPreview').classList.add('hidden');
  const wrap = document.getElementById('previewWrap');
  wrap.classList.remove('hidden');
  const img = document.getElementById('previewImg');
  img.src = src;
  img.style.display = '';
  const ph = document.getElementById('pathPlaceholder');
  if (ph) ph.style.display = 'none';

  document.getElementById('analyzeBtn').disabled = false;
  document.getElementById('analyzeHint').textContent = '';
}

function clearImage() {
  currentImage = null;
  currentImageB64 = null;
  document.getElementById('noPreview').classList.remove('hidden');
  document.getElementById('previewWrap').classList.add('hidden');
  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('analyzeHint').textContent = '请先上传图片';
  document.getElementById('resultCard').classList.add('hidden');
  document.getElementById('filePathInput').value = '';
}

// ======== Analysis ========
function handleAnalyzeResult(d) {
  stopEasterEggTimer();
  document.getElementById('loadingCard').classList.add('hidden');
  if (!d.success) {
    toast('识别失败: ' + d.error, 'error');
    console.log('Raw:', d.raw);
    return;
  }
  resultData = d.data;
  renderTable(resultData);
  document.getElementById('modelInfo').textContent =
    d.model ? ` | 模型: ${d.model}` : '';
  document.getElementById('rawResponse').textContent = d.raw || '(无)';
  document.getElementById('resultCard').classList.remove('hidden');
  document.getElementById('styleCard').classList.remove('hidden');
  document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth' });
  toast('识别成功！下方可选样式生成尺码表图片', 'success');
  saveSCSession();
  if(d.usage&&typeof TK!=='undefined') TK.addOnce(d.usage.input_tokens||0,d.usage.output_tokens||0);
}

async function analyze() {
  if (!currentImage) return toast('请先上传图片', 'error');
  syncMappingsFromUI();
  document.getElementById('loadingCard').classList.remove('hidden');
  document.getElementById('resultCard').classList.add('hidden');
  startEasterEggTimer();
  try {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: currentImage, mappings, model: currentModel })
    });
    handleAnalyzeResult(await r.json());
  } catch (e) {
    stopEasterEggTimer();
    document.getElementById('loadingCard').classList.add('hidden');
    toast('请求失败: ' + e.message, 'error');
  }
}

// DEBUG: 使用预设数据快速预览，跳过 OCR API
async function debugAnalyze() {
  syncMappingsFromUI();
  document.getElementById('loadingCard').classList.remove('hidden');
  document.getElementById('resultCard').classList.add('hidden');
  toast('🚀 Debug 模式：使用预设数据...', 'info');
  try {
    const r = await fetch('/api/debug-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings })
    });
    handleAnalyzeResult(await r.json());
  } catch (e) {
    stopEasterEggTimer();
    document.getElementById('loadingCard').classList.add('hidden');
    toast('Debug 请求失败: ' + e.message, 'error');
  }
}

// ======== Table rendering ========
function renderTable(data) {
  const wrap = document.getElementById('tableWrap');
  if (!data.headers || !data.rows) {
    wrap.innerHTML = '<div class="empty-state">识别结果格式异常</div>';
    return;
  }

  const colW = document.getElementById('colWidthInput').value || 80;
  const { headers, rows } = data;
  let html = '<table id="resultTable"><thead>';
  // Column delete button row
  html += '<tr class="col-del-row">';
  headers.forEach((h, i) => {
    html += `<th class="col-del-cell" style="width:${colW}px;min-width:${colW}px;padding:2px;"><button class="btn btn-danger btn-sm col-del-btn" data-delcol="${i}" title="删除此列">&times;</button></th>`;
  });
  html += '<th class="col-del-cell" style="width:60px;min-width:60px;padding:2px;"></th>';
  html += '</tr>';
  // Header row
  html += '<tr>';
  headers.forEach((h, i) => {
    html += `<th draggable="true" data-col="${i}" data-header="${esc(h)}" class="col-header" style="width:${colW}px;min-width:${colW}px;"><span class="col-label" contenteditable="false">${esc(h)}</span><span class="resize-handle" data-col="${i}"></span></th>`;
  });
  html += '<th style="width:60px;min-width:60px;cursor:default;" data-col="actions">操作</th>';
  html += '</tr></thead><tbody>';

  rows.forEach((row, ri) => {
    html += '<tr>';
    for (let ci = 0; ci < headers.length; ci++) {
      const cell = ci < row.length ? row[ci] : null;
      const val = cell !== null && cell !== undefined ? esc(String(cell)) : '';
      html += `<td contenteditable="true" data-row="${ri}" data-col="${ci}">${val}</td>`;
    }
    html += `<td><div class="row-actions"><button class="btn btn-danger btn-sm" data-delrow="${ri}" title="删除此行">&times;</button></div></td>`;
    html += '</tr>';
  });

  html += '</tbody>';
  // 列选择复选框行
  html += '<tfoot><tr>';
  headers.forEach((h, i) => {
    const checked = selectedColumns.has(i) ? 'checked' : '';
    html += `<td style="text-align:center;padding:3px;background:rgba(245,247,250,.5);"><input type="checkbox" class="col-checkbox" data-col="${i}" ${checked} title="选择整列"></td>`;
  });
  html += '<td style="text-align:center;padding:3px;background:rgba(245,247,250,.5);font-size:10px;color:var(--text2);">全选</td>';
  html += '</tr></tfoot>';
  html += '</table>';
  wrap.innerHTML = html;

  // ---- Drag-to-reorder columns ----
  let dragSrc = -1;
  wrap.querySelectorAll('th.col-header').forEach(th => {
    th.addEventListener('dragstart', e => {
      dragSrc = parseInt(th.dataset.col);
      th.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    th.addEventListener('dragend', e => {
      th.classList.remove('dragging');
      wrap.querySelectorAll('th').forEach(h => h.classList.remove('drag-over'));
    });
    th.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const tgt = parseInt(th.dataset.col);
      if (tgt !== dragSrc) {
        wrap.querySelectorAll('th').forEach(h => h.classList.remove('drag-over'));
        th.classList.add('drag-over');
      }
    });
    th.addEventListener('drop', e => {
      e.preventDefault();
      th.classList.remove('drag-over');
      const tgt = parseInt(th.dataset.col);
      if (tgt !== dragSrc && dragSrc >= 0) {
        // Reorder headers
        const h = resultData.headers.splice(dragSrc, 1)[0];
        resultData.headers.splice(tgt, 0, h);
        // Reorder each row
        resultData.rows.forEach(row => {
          if (row.length > dragSrc) {
            const v = row.splice(dragSrc, 1)[0];
            row.splice(tgt, 0, v);
          }
        });
        renderTable(resultData);
        refreshPreview();
      }
    });
  });

  // ---- Column resize handles ----
  let resizing = null, startX, startW;
  wrap.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      resizing = parseInt(handle.dataset.col);
      startX = e.clientX;
      startW = handle.parentElement.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
  });
  document.addEventListener('mousemove', e => {
    if (resizing == null) return;
    const newW = Math.max(24, startW + (e.clientX - startX));
    document.getElementById('colWidthInput').value = newW;
    applyColWidth(newW);
  });
  document.addEventListener('mouseup', () => {
    if (resizing != null) {
      const finalW = document.getElementById('colWidthInput').value;
      // Save individual width on the header
      const th = document.querySelector(`th.col-header[data-col="${resizing}"]`);
      if (th && finalW) th.style.width = finalW + 'px';
      resizing = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  // Bind row delete
  wrap.querySelectorAll('[data-delrow]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ri = parseInt(btn.dataset.delrow);
      resultData.rows.splice(ri, 1);
      renderTable(resultData);
      refreshPreview();
      toast('已删除行', 'info');
    });
  });

  // Bind column delete
  wrap.querySelectorAll('[data-delcol]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const ci = parseInt(btn.dataset.delcol);
      if (resultData.headers.length <= 1) {
        toast('至少保留一列', 'error');
        return;
      }
      resultData.headers.splice(ci, 1);
      resultData.rows.forEach(row => {
        row.splice(ci, 1);
        if (row.length > resultData.headers.length) row.length = resultData.headers.length;
      });
      renderTable(resultData);
      refreshPreview();
      toast('已删除列', 'info');
    });
  });

  // Bind cell edits
  wrap.querySelectorAll('td[contenteditable]').forEach(td => {
    td.addEventListener('input', () => syncTableFromUI());
  });

  // Bind header edits (double-click to edit name)
  wrap.querySelectorAll('th.col-header .col-label').forEach(label => {
    label.addEventListener('dblclick', () => {
      label.contentEditable = 'true';
      label.focus();
    });
    label.addEventListener('blur', () => {
      label.contentEditable = 'false';
      const th = label.closest('th');
      if (th) th.dataset.header = label.textContent.trim();
      syncTableFromUI();
    });
  });

  // Bind cell selection events
  bindSelectionEvents();

  // Bind column checkbox events
  wrap.querySelectorAll('.col-checkbox').forEach(cb => {
    cb.addEventListener('change', function() {
      const ci = parseInt(this.dataset.col);
      if (this.checked) {
        selectedColumns.add(ci);
      } else {
        selectedColumns.delete(ci);
      }
      highlightColumns();
    });
  });

  // Restore checkbox-based column highlighting
  if (selectedColumns.size > 0) highlightColumns();
}

function applyColWidth(w) {
  document.querySelectorAll('th.col-header, th.col-del-cell').forEach(th => {
    th.style.width = w + 'px';
    th.style.minWidth = w + 'px';
  });
}

function syncTableFromUI() {
  if (!resultData) return;
  const headers = [];
  document.querySelectorAll('th.col-header').forEach(th => {
    const label = th.querySelector('.col-label');
    headers.push(label ? label.textContent.trim() : (th.dataset.header || ''));
  });
  resultData.headers = headers;

  const rows = [];
  document.querySelectorAll('tbody tr').forEach(tr => {
    const row = [];
    tr.querySelectorAll('td[contenteditable]').forEach(td => {
      const v = td.textContent.trim();
      row.push(v === '' ? null : v);
    });
    if (row.length > 0) rows.push(row);
  });
  resultData.rows = rows;
}

// ======== Row/Col operations ========
function addRow() {
  if (!resultData) return;
  const newRow = resultData.headers.map(() => '');
  resultData.rows.push(newRow);
  renderTable(resultData);
  refreshPreview();
  toast('已添加空行', 'info');
}

function addCol() {
  if (!resultData) return;
  const name = prompt('新列表头名称：');
  if (!name) return;
  resultData.headers.push(name);
  resultData.rows.forEach(row => row.push(''));
  renderTable(resultData);
  refreshPreview();
  toast(`已添加列: ${name}`, 'info');
}

// ======== Preview sync ========
function buildExportStylePayload() {
  const colW = { _default: exportColWidth };
  Object.keys(exportColWidths).forEach(k => { colW[k] = exportColWidths[k]; });
  const rowH = { _default: exportRowHeight };
  Object.keys(exportRowHeights).forEach(k => { rowH[k] = exportRowHeights[k]; });
  return { colWidths: colW, rowHeights: rowH, headerHeight: exportHeaderHeight, fontWeight: currentFontWeight, fontSize: currentFontSize, headerFontSize: currentHeaderFontSize, exportConfig };
}

function refreshPreview() {
  if (!selectedTemplate || !resultData) return Promise.resolve();
  syncTableFromUI();
  const payload = buildExportStylePayload();
  return fetch('/api/apply-template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: selectedTemplate, data: resultData, colWidths: payload.colWidths, rowHeights: payload.rowHeights, headerHeight: payload.headerHeight, fontWeight: payload.fontWeight, fontSize: payload.fontSize, headerFontSize: payload.headerFontSize, exportConfig: payload.exportConfig })
  }).then(r => r.json()).then(d => {
    if (d.success) {
      filledHtml = d.html;
      const iframe = document.getElementById('stylePreview');
      const handler = () => {
        iframe.removeEventListener('load', handler);
        setTimeout(scalePreviewToFit, 100);
        setTimeout(applyExportColWidths, 200);
      };
      iframe.addEventListener('load', handler);
      iframe.srcdoc = d.html;
      // fallback: 如果 load 没触发，1.5s后强行缩放
      setTimeout(() => { try { scalePreviewToFit(); applyExportColWidths(); } catch(e) {} }, 1500);
    }
  }).catch(e => console.error('refreshPreview:', e));
}

async function scalePreviewToFit() {
  const wrap = document.getElementById('stylePreviewWrap');
  const iframe = document.getElementById('stylePreview');
  if (!wrap || !iframe) return;
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    const body = doc.body;
    if (!body) return;
    // 等字体和布局稳定后再测量
    try { await doc.fonts.ready; } catch(e) {}
    await new Promise(r => requestAnimationFrame(r));
    const bw = body.scrollWidth || body.offsetWidth || 1200;
    const bh = body.scrollHeight || body.offsetHeight || 600;
    const cw = wrap.clientWidth - 20;
    if (bw <= cw) {
      iframe.style.width = '100%';
      iframe.style.height = bh + 'px';
      iframe.style.transform = '';
      wrap.style.height = Math.min(bh + 10, 500) + 'px';
      return;
    }
    const s = (cw / bw).toFixed(3);
    iframe.style.width = bw + 'px';
    iframe.style.height = bh + 'px';
    iframe.style.transform = `scale(${s})`;
    iframe.style.transformOrigin = 'top left';
    wrap.style.height = Math.ceil(bh * s) + 'px';
  } catch(e) {}
}

// ======== 导出列宽控制 ========
function refreshFineTunePanel() {
  const panel = document.getElementById('fineTunePanel');
  if (!resultData || !resultData.headers) { panel.innerHTML = ''; return; }
  let html = '';
  resultData.headers.forEach((h, i) => {
    const w = exportColWidths[i] !== undefined ? exportColWidths[i] : exportColWidth;
    html += `<div style="display:flex;align-items:center;gap:6px;margin:3px 0;font-size:12px;">
      <span style="width:70px;text-align:right;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(h)}">${esc(h)}</span>
      <input type="range" min="1" max="300" value="${w}" data-col="${i}" class="fine-slider" style="flex:1;cursor:pointer;">
      <input type="number" value="${w}" min="1" max="400" data-col="${i}" class="fine-input" style="width:45px;padding:1px 3px;border:1px solid var(--border);border-radius:4px;font-size:11px;text-align:center;">
      <span style="font-size:10px;color:var(--text2);width:16px;">px</span>
      <button class="btn btn-sm" data-reset="${i}" style="padding:1px 5px;font-size:10px;" title="重置此列">↺</button>
    </div>`;
  });
  panel.innerHTML = html;
  // 滑块事件 — 拖动即时生效
  panel.querySelectorAll('.fine-slider').forEach(sl => {
    sl.addEventListener('input', function() {
      const ci = parseInt(this.dataset.col);
      const inp = panel.querySelector(`.fine-input[data-col="${ci}"]`);
      inp.value = this.value;
      exportColWidths[ci] = parseInt(this.value);
      applyExportColWidths();
    });
  });
  // 数字输入事件
  panel.querySelectorAll('.fine-input').forEach(inp => {
    inp.addEventListener('change', function() {
      const ci = parseInt(this.dataset.col);
      const sl = panel.querySelector(`.fine-slider[data-col="${ci}"]`);
      const v = parseInt(this.value) || exportColWidth;
      this.value = v;
      sl.value = v;
      exportColWidths[ci] = v;
      applyExportColWidths();
    });
  });
  // 重置按钮
  panel.querySelectorAll('[data-reset]').forEach(btn => {
    btn.addEventListener('click', function() {
      const ci = parseInt(this.dataset.reset);
      delete exportColWidths[ci];
      refreshFineTunePanel();
      applyExportColWidths();
    });
  });
}

function applyExportColWidths() {
  const iframe = document.getElementById('stylePreview');
  if (!iframe) return;
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    const cols = doc.querySelectorAll('colgroup col');
    let totalTableW = 0;
    cols.forEach((col, i) => {
      const w = exportColWidths[i] !== undefined ? exportColWidths[i] : exportColWidth;
      col.style.width = w + 'px';
      totalTableW += w;
    });
    // line 模板装饰线位置：从 DOM 实际渲染值读取
    const table = doc.querySelector('.size-table');
    if (table) {
      const firstTh = table.querySelector('thead th');
      const lineX = firstTh ? firstTh.offsetWidth : (exportColWidths[0] !== undefined ? exportColWidths[0] : exportColWidth);
      const headerTh = table.querySelector('thead th');
      const lineY = headerTh ? headerTh.offsetHeight : exportHeaderHeight;
      const bgW = exportConfig.bgWidth || 1200;
      const pad = exportConfig.padding || 55;
      const extra = Math.max(0, (bgW - totalTableW - 2 * pad) / 2);
      table.style.setProperty('--line-x', lineX + 'px');
      table.style.setProperty('--line-y', lineY + 'px');
      table.style.setProperty('--line-offset', Math.round(pad + extra) + 'px');
    }
  } catch(e) {}
}

// ======== 导出行高控制 ========
function refreshFineTuneRowPanel() {
  const panel = document.getElementById('fineTuneRowPanel');
  if (!resultData || !resultData.rows) { panel.innerHTML = ''; return; }
  let html = '';
  resultData.rows.forEach((row, ri) => {
    const h = exportRowHeights[ri] !== undefined ? exportRowHeights[ri] : exportRowHeight;
    const label = row[0] ? esc(String(row[0])) : ('行' + (ri + 1));
    html += `<div style="display:flex;align-items:center;gap:6px;margin:3px 0;font-size:12px;">
      <span style="width:60px;text-align:right;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${label}">${label}</span>
      <input type="range" min="1" max="200" value="${h}" data-row="${ri}" class="fine-row-slider" style="flex:1;cursor:pointer;">
      <input type="number" value="${h}" min="1" max="200" data-row="${ri}" class="fine-row-input" style="width:45px;padding:1px 3px;border:1px solid var(--border);border-radius:4px;font-size:11px;text-align:center;">
      <span style="font-size:10px;color:var(--text2);width:16px;">px</span>
      <button class="btn btn-sm" data-reset-row="${ri}" style="padding:1px 5px;font-size:10px;" title="重置此行">↺</button>
    </div>`;
  });
  panel.innerHTML = html;
  panel.querySelectorAll('.fine-row-slider').forEach(sl => {
    sl.addEventListener('input', function() {
      const ri = parseInt(this.dataset.row);
      const inp = panel.querySelector(`.fine-row-input[data-row="${ri}"]`);
      inp.value = this.value;
      exportRowHeights[ri] = parseInt(this.value);
      applyExportRowHeights();
    });
  });
  panel.querySelectorAll('.fine-row-input').forEach(inp => {
    inp.addEventListener('change', function() {
      const ri = parseInt(this.dataset.row);
      const sl = panel.querySelector(`.fine-row-slider[data-row="${ri}"]`);
      const v = parseInt(this.value) || exportRowHeight;
      this.value = v;
      sl.value = v;
      exportRowHeights[ri] = v;
      applyExportRowHeights();
    });
  });
  panel.querySelectorAll('[data-reset-row]').forEach(btn => {
    btn.addEventListener('click', function() {
      const ri = parseInt(this.dataset.resetRow);
      delete exportRowHeights[ri];
      refreshFineTuneRowPanel();
      applyExportRowHeights();
    });
  });
}

function applyExportRowHeights() {
  const iframe = document.getElementById('stylePreview');
  if (!iframe) return;
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    const rows = doc.querySelectorAll('table tbody tr');
    rows.forEach((tr, ri) => {
      const h = exportRowHeights[ri] !== undefined ? exportRowHeights[ri] : exportRowHeight;
      tr.querySelectorAll('td').forEach(td => {
        td.style.height = h + 'px'; td.style.lineHeight = h + 'px'; td.style.padding = '0 4px';
      });
    });
    const theadThs = doc.querySelectorAll('table thead th');
    theadThs.forEach(th => {
      th.style.height = exportHeaderHeight + 'px'; th.style.lineHeight = exportHeaderHeight + 'px'; th.style.padding = '0 4px';
    });
  } catch(e) {}
}

// ======== Export ========
function buildCsv() {
  syncTableFromUI();
  const { headers, rows } = resultData;
  const escapeCsv = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [];
  lines.push(headers.map(escapeCsv).join(','));
  rows.forEach(row => {
    lines.push(row.map(escapeCsv).join(','));
  });
  return lines.join('\n');
}

function exportCsv() {
  if (!resultData) return;
  const csv = buildCsv();
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '用户尺码表_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV 文件已下载，可用 Excel 打开', 'success');
}

async function copyTable() {
  if (!resultData) return;
  const csv = buildCsv();
  // Use tab-separated for better Excel paste
  const tsv = csv.replace(/,/g, '\t');
  try {
    await navigator.clipboard.writeText(tsv);
    toast('已复制到剪贴板，可直接粘贴到 Excel', 'success');
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = tsv;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('已复制到剪贴板', 'success');
  }
}

// ======== Cell selection & copy ========
function getCellRowCol(cell) {
  const row = parseInt(cell.dataset.row);
  const col = parseInt(cell.dataset.col);
  if (isNaN(row) || isNaN(col)) {
    // 对于 th 元素，col 从 dataset 中取
    const th = cell.closest('th');
    if (th && th.dataset.col !== undefined) {
      return { row: -1, col: parseInt(th.dataset.col) };
    }
    return null;
  }
  return { row, col };
}

function clearSelection() {
  document.querySelectorAll('#resultTable .cell-selected').forEach(el => el.classList.remove('cell-selected'));
  selectionStart = null;
  selectionEnd = null;
  selectedColumns.clear();
  document.querySelectorAll('.col-checkbox').forEach(cb => cb.checked = false);
  document.getElementById('copySelectionImgBtn').classList.add('hidden');
  document.getElementById('copySelectionTextBtn').classList.add('hidden');
}

function clearDragSelection() {
  // 只清除拖选，不清除复选框
  document.querySelectorAll('#resultTable .cell-selected').forEach(el => el.classList.remove('cell-selected'));
  selectionStart = null;
  selectionEnd = null;
  // 恢复复选框高亮
  if (selectedColumns.size > 0) highlightColumns();
  else {
    document.getElementById('copySelectionImgBtn').classList.add('hidden');
    document.getElementById('copySelectionTextBtn').classList.add('hidden');
  }
}

function highlightColumns() {
  const table = document.getElementById('resultTable');
  if (!table) return;
  // 清除所有高亮
  table.querySelectorAll('.cell-selected').forEach(el => el.classList.remove('cell-selected'));
  // 高亮选中列的所有数据单元格
  selectedColumns.forEach(ci => {
    table.querySelectorAll(`td[data-col="${ci}"]`).forEach(td => td.classList.add('cell-selected'));
    table.querySelectorAll(`th.col-header[data-col="${ci}"]`).forEach(th => th.classList.add('cell-selected'));
  });
  // 显示/隐藏复制按钮
  const hasSelection = selectedColumns.size > 0 || (selectionStart && selectionEnd);
  document.getElementById('copySelectionImgBtn').classList.toggle('hidden', !hasSelection);
  document.getElementById('copySelectionTextBtn').classList.toggle('hidden', !hasSelection);
}

function highlightSelection() {
  if (!selectionStart || !selectionEnd) return;
  const minRow = Math.min(selectionStart.row, selectionEnd.row);
  const maxRow = Math.max(selectionStart.row, selectionEnd.row);
  const minCol = Math.min(selectionStart.col, selectionEnd.col);
  const maxCol = Math.max(selectionStart.col, selectionEnd.col);
  const table = document.getElementById('resultTable');
  if (!table) return;
  // Clear old selection
  table.querySelectorAll('.cell-selected').forEach(el => el.classList.remove('cell-selected'));
  // Highlight cells in the rectangle
  for (let ri = minRow; ri <= maxRow; ri++) {
    for (let ci = minCol; ci <= maxCol; ci++) {
      table.querySelectorAll(`td[data-row="${ri}"][data-col="${ci}"]`).forEach(td => td.classList.add('cell-selected'));
    }
  }
  // Also highlight header cells (row=-1)
  for (let ci = minCol; ci <= maxCol; ci++) {
    table.querySelectorAll(`th.col-header[data-col="${ci}"]`).forEach(th => th.classList.add('cell-selected'));
  }
  // Show/hide copy buttons
  const hasSelection = (maxRow >= minRow || maxCol >= minCol);
  document.getElementById('copySelectionImgBtn').classList.toggle('hidden', !hasSelection);
  document.getElementById('copySelectionTextBtn').classList.toggle('hidden', !hasSelection);
}

function bindSelectionEvents() {
  const table = document.getElementById('resultTable');
  if (!table) return;

  table.addEventListener('mousedown', e => {
    // 只在点击数据单元格时启动选区（不干扰表头拖拽排序、不干扰复选框）
    const cell = e.target.closest('td[data-row][data-col]');
    if (!cell) return;
    // 如果点击的是复选框或其 label，不启动拖选
    if (e.target.closest('.col-checkbox') || e.target.closest('tfoot')) return;
    clearDragSelection();
    isSelecting = true;
    selectionStart = getCellRowCol(cell);
    selectionEnd = selectionStart;
    highlightSelection();
  });

  // 使用 document 级别的 mousemove + elementFromPoint，确保鼠标移到表头区也不会断
  document.addEventListener('mousemove', e => {
    if (!isSelecting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    // 尝试匹配数据单元格
    const td = el.closest('td[data-row][data-col]');
    if (td) {
      selectionEnd = getCellRowCol(td);
      highlightSelection();
      return;
    }
    // 如果鼠标在表头区域，扩展选区到对应列（行范围保持）
    const th = el.closest('th.col-header[data-col]');
    if (th && selectionEnd) {
      const col = parseInt(th.dataset.col);
      selectionEnd = { row: selectionEnd.row, col: col };
      highlightSelection();
    }
  });

  document.addEventListener('mouseup', () => {
    if (isSelecting) {
      isSelecting = false;
      // Normalize selection so start is top-left
      if (selectionStart && selectionEnd) {
        const minRow = Math.min(selectionStart.row, selectionEnd.row);
        const maxRow = Math.max(selectionStart.row, selectionEnd.row);
        const minCol = Math.min(selectionStart.col, selectionEnd.col);
        const maxCol = Math.max(selectionStart.col, selectionEnd.col);
        selectionStart = { row: minRow, col: minCol };
        selectionEnd = { row: maxRow, col: maxCol };
      }
    }
  });

  // Click outside table to clear selection
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('#resultTable') && !e.target.closest('#copySelectionImgBtn') && !e.target.closest('#copySelectionTextBtn')) {
      clearSelection();
    }
  });
}

function _getSelectionColsRows() {
  const origTable = document.getElementById('resultTable');
  if (!origTable) { console.warn('[copy] resultTable not found'); return null; }
  if (!resultData || !resultData.rows) { console.warn('[copy] resultData empty', !!resultData, !!resultData?.rows); return null; }
  const totalRows = resultData.rows.length;
  if (selectedColumns.size > 0) {
    const cols = [...selectedColumns].sort((a, b) => a - b);
    console.log('[copy] using checkboxes, cols:', cols, 'rows:', totalRows);
    return { cols, minRow: 0, maxRow: totalRows - 1, origTable };
  }
  if (selectionStart && selectionEnd) {
    const minCol = Math.min(selectionStart.col, selectionEnd.col);
    const maxCol = Math.max(selectionStart.col, selectionEnd.col);
    const minRow = Math.max(0, Math.min(selectionStart.row, selectionEnd.row));
    const maxRow = Math.min(totalRows - 1, Math.max(selectionStart.row, selectionEnd.row));
    const cols = [];
    for (let ci = minCol; ci <= maxCol; ci++) cols.push(ci);
    console.log('[copy] using drag selection, cols:', cols, 'rows:', minRow, '-', maxRow);
    return { cols, minRow, maxRow, origTable };
  }
  console.warn('[copy] no selection (no checkboxes, no drag)');
  return null;
}

async function copySelectionAsImage() {
  console.log('[copy-img] clicked');
  const sel = _getSelectionColsRows();
  if (!sel) { toast('请拖选单元格或勾选列复选框', 'error'); return; }
  const { cols, minRow, maxRow, origTable } = sel;

  toast('正在渲染选区...', 'info');

  // 构建纯净 HTML 字符串 — 全内联样式，零类名
  const cellS = 'border:1px solid #ccc;padding:6px 10px;text-align:center;';
  const thS = cellS + 'background:#f0f0f0;font-weight:600;color:#000;';
  const tdS = cellS + 'background:#ffffff;color:#000;';
  let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse}</style></head><body style="margin:0;background:#fff;"><table>';
  // 表头
  html += '<thead><tr>';
  cols.forEach(ci => {
    const origTh = origTable.querySelector(`th.col-header[data-col="${ci}"]`);
    const label = origTh ? (origTh.querySelector('.col-label')?.textContent || origTh.dataset.header || '') : '';
    html += `<th style="${thS}">${esc(label)}</th>`;
  });
  html += '</tr></thead>';
  // 数据
  html += '<tbody>';
  for (let ri = minRow; ri <= maxRow; ri++) {
    html += '<tr>';
    cols.forEach(ci => {
      const origTd = origTable.querySelector(`td[data-row="${ri}"][data-col="${ci}"]`);
      const val = origTd ? esc(origTd.textContent.trim()) : '';
      html += `<td style="${tdS}">${val}</td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table></body></html>';

  // 用临时 iframe 隔离渲染 — 独立的干净文档，零样式泄漏
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:1200px;height:800px;z-index:99999;background:#fff;';
  iframe.srcdoc = html;
  document.body.appendChild(iframe);

  try {
    await new Promise((resolve, reject) => {
      iframe.onload = resolve;
      setTimeout(() => reject(new Error('iframe load timeout')), 5000);
    });
    // 等一下让字体/布局稳定
    await new Promise(r => setTimeout(r, 200));
    const iframeTable = iframe.contentDocument.querySelector('table');
    if (!iframeTable) throw new Error('iframe table not found');
    const canvas = await html2canvas(iframeTable, { backgroundColor: '#ffffff', scale: 2 });
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
    });
    await navigator.clipboard.write([new ClipboardItem({"image/png": blob})]);
    toast('选区已复制为图片，可粘贴到 PSD', 'success');
  } catch (err) {
    toast('渲染选区失败: ' + err.message, 'error');
  } finally {
    document.body.removeChild(iframe);
  }
}

async function copySelectionAsText() {
  console.log('[copy-txt] clicked');
  const sel = _getSelectionColsRows();
  if (!sel) { toast('请拖选单元格或勾选列复选框', 'error'); return; }
  const { cols, minRow, maxRow, origTable } = sel;

  const lines = [];
  // 先输出表头字段
  cols.forEach(ci => {
    const th = origTable.querySelector(`th.col-header[data-col="${ci}"]`);
    lines.push(th ? (th.querySelector('.col-label')?.textContent || th.dataset.header || '') : '');
  });
  // 再输出数据行，每个单元格值一行
  for (let ri = minRow; ri <= maxRow; ri++) {
    cols.forEach(ci => {
      const td = origTable.querySelector(`td[data-row="${ri}"][data-col="${ci}"]`);
      const val = td ? td.textContent.trim() : '';
      lines.push(val);
    });
  }
  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('选区文本已复制（每行一个值）', 'success');
  } catch (err) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('选区文本已复制', 'success');
  }
}

// ======== Mapping management ========
function syncMappingsFromUI() {
  const newMappings = {};
  document.querySelectorAll('.mapping-row').forEach(row => {
    const keyInp = row.querySelector('[data-field="key"]');
    const valInp = row.querySelector('[data-field="val"]');
    if (keyInp && valInp && keyInp.value.trim()) {
      newMappings[keyInp.value.trim()] = valInp.value.trim();
    }
  });
  mappings = newMappings;
}

function onMappingEdit(e) {
  if (!e.target.matches('input')) return;
  syncMappingsFromUI();
}

function onMappingClick(e) {
  if (e.target.dataset.action === 'del') {
    const idx = parseInt(e.target.dataset.idx);
    const keys = Object.keys(mappings);
    if (idx >= 0 && idx < keys.length) {
      delete mappings[keys[idx]];
      renderMappings();
      saveMappings();
    }
  }
}

function addMapping() {
  const key = document.getElementById('newKey').value.trim();
  const val = document.getElementById('newVal').value.trim();
  if (!key || !val) return toast('请输入工厂表头和用户表头名称', 'error');
  mappings[key] = val;
  renderMappings(key);
  saveMappings();
  document.getElementById('newKey').value = '';
  document.getElementById('newVal').value = '';
  document.getElementById('newKey').focus();
}

async function resetMappings() {
  try {
    const r = await fetch('/api/mappings/reset', { method: 'POST' });
    const d = await r.json();
    mappings = d.mappings;
    renderMappings();
    toast('已恢复默认映射', 'info');
  } catch (e) {
    toast('操作失败: ' + e.message, 'error');
  }
}

async function saveMappings() {
  syncMappingsFromUI();
  try {
    await fetch('/api/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mappings)
    });
    toast('映射已保存', 'success');
  } catch (e) {
    toast('保存失败: ' + e.message, 'error');
  }
}

// ======== Toast ========
function toast(msg, type) {
  const emoji = { error: '❌ ', success: '✅ ', info: 'ℹ️ ' }[type] || '';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = emoji + msg;
  document.body.appendChild(el);
  const duration = type === 'error' ? 6000 : 3000;
  setTimeout(() => { el.remove(); }, duration);
}

// ======== Style Selection ========
let selectedTemplate = null;
let filledHtml = '';

async function loadTemplates() {
  try {
    const r = await fetch('/api/templates');
    const d = await r.json();
    if (!d.success) return;
    const grid = document.getElementById('styleGrid');
    grid.innerHTML = d.templates.map(t => `
      <div class="style-card" data-id="${t.id}" onclick="selectTemplate('${t.id}')">
        <img src="${t.preview}" alt="${t.name}" loading="lazy">
        <div class="style-name">${t.name}</div>
      </div>
    `).join('');
  } catch (e) {
    console.error('loadTemplates:', e);
  }
}

async function selectTemplate(tplId) {
  if (!resultData) return toast('请先识别尺码表', 'error');
  selectedTemplate = tplId;
  document.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
  document.querySelector(`.style-card[data-id="${tplId}"]`)?.classList.add('selected');

  syncTableFromUI();
  try {
    const r = await fetch('/api/apply-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: tplId, data: resultData })
    });
    const d = await r.json();
    if (d.success) {
      filledHtml = d.html;
      const iframe = document.getElementById('stylePreview');
      const handler = () => { iframe.removeEventListener('load', handler); setTimeout(scalePreviewToFit, 100); };
      iframe.addEventListener('load', handler);
      iframe.srcdoc = d.html;
      setTimeout(() => { try { scalePreviewToFit(); } catch(e) {} }, 1500);
    } else {
      toast(d.error, 'error');
    }
  } catch (e) {
    toast('应用模板失败: ' + e.message, 'error');
  }
}

async function exportPng() {
  if (!selectedTemplate || !resultData) return toast('请先选择模板', 'error');
  syncTableFromUI();
  // 优先尝试服务端渲染（本地 Playwright）
  try {
    const payload = buildExportStylePayload();
    const r = await fetch('/api/render-template-png', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: selectedTemplate, data: resultData, colWidths: payload.colWidths, rowHeights: payload.rowHeights, headerHeight: payload.headerHeight, fontWeight: payload.fontWeight, fontSize: payload.fontSize, headerFontSize: payload.headerFontSize, exportConfig: payload.exportConfig })
    });
    if (r.ok) {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '尺码表_' + selectedTemplate.replace('.html', '') + '.png';
      a.click();
      URL.revokeObjectURL(url);
      toast('PNG 已下载', 'success');
      return;
    }
  } catch (e) { /* 降级客户端渲染 */ }
  // 客户端渲染（Vercel/EXE兜底）
  try {
    await refreshPreview();
    await new Promise(r => setTimeout(r, 400));
    if (!filledHtml) { toast('导出失败: 预览未加载', 'error'); return; }

    // 把 @font-face 注入主 document — html2canvas 在主 document 创建 canvas，
    // 无法访问 iframe 内注册的字体，必须让字体在主 document 也注册一份
    let ffCleanup = null;
    const ffMatch = filledHtml.match(/@font-face\s*\{[^}]*\}/);
    if (ffMatch) {
      const urlMatch = ffMatch[0].match(/url\(['"]?([^'"]+)['"]?\)/);
      const weightMatch = ffMatch[0].match(/font-weight:\s*(\d+)/);
      if (urlMatch && weightMatch) {
        try {
          const font = new FontFace('PingFangSC', 'url(' + urlMatch[1] + ')', { weight: weightMatch[1] });
          const loadedFont = await font.load();
          document.fonts.add(loadedFont);
          ffCleanup = loadedFont;
        } catch(e) {
          // Fallback: CSS 注入
          ffCleanup = document.createElement('style');
          ffCleanup.textContent = ffMatch[0];
          document.head.appendChild(ffCleanup);
          try { await document.fonts.ready; } catch(e) {}
        }
      }
    }

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;';
    frame.srcdoc = filledHtml;
    document.body.appendChild(frame);
    await new Promise((resolve, reject) => {
      frame.onload = resolve;
      setTimeout(() => reject(new Error('timeout')), 6000);
    });
    try { await frame.contentDocument.fonts.ready; } catch(e) {}
    await new Promise(r => setTimeout(r, 300));

    const body = frame.contentDocument.body;
    const canvas = await html2canvas(body, { backgroundColor: '#ffffff', scale: 1 });
    document.body.removeChild(frame);
    if (ffCleanup) {
      if (ffCleanup instanceof FontFace) document.fonts.delete(ffCleanup);
      else ffCleanup.remove();
    }

    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '尺码表_' + selectedTemplate.replace('.html', '') + '.png';
      a.click();
      URL.revokeObjectURL(url);
      toast('PNG 已下载', 'success');
    }, 'image/png');
  } catch (e) {
    toast('导出失败: ' + e.message, 'error');
  }
}

// ======== Wallpaper ========
const WALLPAPER_KEY = 'sizeflow_wallpaper';

// 内置渐变色壁纸 — 纯色系微妙过渡，每次刷新随机切换
const GRADIENT_WALLPAPERS = [
  { id: 'gradient-mist',      name: '晨雾', css: 'linear-gradient(155deg, #c9d9e0 0%, #b8c9d4 25%, #d4cfd8 55%, #c2bbc9 80%, #d5dbe3 100%)' },
  { id: 'gradient-lichen',    name: '苔色', css: 'linear-gradient(140deg, #c5cdc0 0%, #bcc4b6 20%, #d4cfc2 45%, #c9c5b8 70%, #dbd7ce 100%)' },
  { id: 'gradient-thistle',   name: '蓟花', css: 'linear-gradient(130deg, #cbc5d4 0%, #d1c9d9 30%, #c4becb 55%, #dcd5e0 80%, #c8c3cf 100%)' },
  { id: 'gradient-shell',     name: '贝母', css: 'radial-gradient(ellipse at 40% 30%, #e4dcd5 0%, #dbd2ca 25%, #e0d9d2 50%, #d6cec7 75%, #e8e2dc 100%)' },
  { id: 'gradient-dusk',      name: '薄暮', css: 'linear-gradient(160deg, #c0c7d4 0%, #c8c5d2 20%, #d4ccd6 45%, #cbc5d0 70%, #cfcdd9 100%)' },
  { id: 'gradient-willow',    name: '烟柳', css: 'linear-gradient(145deg, #ccd5ca 0%, #c8d2c5 25%, #d5d9cf 50%, #cbd2c6 75%, #d8ded3 100%)' },
  { id: 'gradient-heather',   name: '石楠', css: 'linear-gradient(125deg, #d0cbd6 0%, #c9c2d1 30%, #d6ced8 55%, #ccc5d3 80%, #d9d3dc 100%)' },
  { id: 'gradient-sand drift', name: '流沙', css: 'linear-gradient(150deg, #dcd5cb 0%, #d7cfc4 25%, #e0d9cf 50%, #d9d1c7 75%, #e4ddd4 100%)' },
  { id: 'gradient-oat',        name: '燕麦', css: 'linear-gradient(135deg, #e2d9c8 0%, #ddd3c0 30%, #e8dfd0 55%, #dcd2c2 80%, #e5ddd0 100%)' },
  { id: 'gradient-stone',      name: '青石', css: 'linear-gradient(148deg, #c8cdc8 0%, #c2c7c2 25%, #cdd2cc 50%, #c4c9c4 75%, #d0d5cf 100%)' },
  { id: 'gradient-lavender',   name: '薰衣', css: 'linear-gradient(142deg, #d0c9d9 0%, #cbc4d5 30%, #d6d0de 55%, #cec7d7 80%, #d9d3e2 100%)' },
  { id: 'gradient-sage',       name: '鼠尾', css: 'linear-gradient(138deg, #c8cfc0 0%, #c2cab9 25%, #cdd4c5 50%, #c5cdbc 75%, #d0d7c8 100%)' },
  { id: 'gradient-slate',      name: '板岩', css: 'linear-gradient(155deg, #bbc0c8 0%, #b5bac3 25%, #c1c5cd 50%, #b8bdc5 75%, #c4c8d0 100%)' },
  { id: 'gradient-rose dust',  name: '尘玫', css: 'linear-gradient(132deg, #d6c9cb 0%, #d1c3c6 30%, #dbcfd1 55%, #d3c6c9 80%, #ded3d5 100%)' },
  { id: 'gradient-ivory',      name: '象牙', css: 'linear-gradient(145deg, #e8e2d8 0%, #e3dcd0 25%, #ebe6dc 50%, #e5ded4 75%, #eee9e0 100%)' },
  { id: 'gradient-cloud',      name: '卷云', css: 'linear-gradient(160deg, #dde1e4 0%, #d7dbe0 25%, #e2e5e8 50%, #d9dde2 75%, #e5e8eb 100%)' },
  { id: 'gradient-flax',       name: '亚麻', css: 'linear-gradient(140deg, #ddd6c5 0%, #d8d0be 30%, #e2dcc9 55%, #dad3c2 80%, #e5dfce 100%)' },
  { id: 'gradient-pewter',     name: '锡灰', css: 'linear-gradient(152deg, #c5c5c5 0%, #bfbfbf 25%, #cacaca 50%, #c2c2c2 75%, #cdcdcd 100%)' },
  { id: 'gradient-moss',       name: '苔痕', css: 'linear-gradient(143deg, #c4ccba 0%, #bec6b3 25%, #c9d1bf 50%, #c1c9b6 75%, #ccd4c2 100%)' },
];

function getRandomGradient() {
  const i = Math.floor(Math.random() * GRADIENT_WALLPAPERS.length);
  return GRADIENT_WALLPAPERS[i];
}

function loadWallpaper() {
  const saved = localStorage.getItem(WALLPAPER_KEY);
  if (saved) {
    try {
      const wp = JSON.parse(saved);
      applyWallpaper(wp);
      return wp;
    } catch(e) {}
  }
  return null;
}

function saveWallpaper(wp) {
  localStorage.setItem(WALLPAPER_KEY, JSON.stringify(wp));
}

function applyWallpaper(wp) {
  if (!wp) {
    document.body.style.backgroundImage = 'linear-gradient(135deg, #e8eef5 0%, #dce3ed 30%, #e2e8f2 60%, #d5dfea 100%)';
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
    return;
  }
  if (wp.type === 'gradient') {
    document.body.style.backgroundImage = wp.url;
    document.body.style.backgroundSize = 'auto';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
  } else {
    document.body.style.backgroundImage = `url(${wp.url})`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
  }
}

async function loadWallpaperList() {
  try {
    const r = await fetch('/api/wallpapers');
    const d = await r.json();
    if (!d.success) return;
    const grid = document.getElementById('wallpaperGrid');
    const current = loadWallpaper();

    // 渐变色预览卡片
    let gradientCards = GRADIENT_WALLPAPERS.map(wp => `
      <div class="wp-card ${current && current.id === wp.id ? 'selected' : ''}" onclick="selectWallpaper('${wp.id}', '${wp.css.replace(/'/g, "\\'")}', '${wp.name}', 'gradient')">
        <div style="width:100%;height:100%;background:${wp.css};"></div>
        <div class="wp-label">${wp.name}</div>
      </div>
    `).join('');

    // 图片壁纸卡片
    let imageCards = d.wallpapers.map(wp => `
      <div class="wp-card ${current && current.id === wp.id ? 'selected' : ''}" onclick="selectWallpaper('${wp.id}', '${wp.url}', '${wp.name}', 'image')">
        <img src="${wp.url}" alt="${wp.name}" loading="lazy">
        <div class="wp-label">${wp.name}</div>
      </div>
    `).join('');

    grid.innerHTML = gradientCards + imageCards;
  } catch(e) {}
}

function selectWallpaper(id, url, name, type) {
  const wp = { id, url, name, type: type || 'image' };
  saveWallpaper(wp);
  applyWallpaper(wp);
  document.querySelectorAll('.wp-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('wallpaperPanel').classList.add('hidden');
}

// Upload custom wallpaper
document.getElementById('wallpaperUpload').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const url = reader.result;
    const wp = { id: 'custom', url, name: '自定义壁纸', type: 'image' };
    saveWallpaper(wp);
    applyWallpaper(wp);
    document.getElementById('wallpaperPanel').classList.add('hidden');
    toast('壁纸已应用', 'success');
  };
  reader.readAsDataURL(file);
});

// ======== Configuration Presets ========

function loadPresets() {
  try {
    const saved = localStorage.getItem(PRESETS_KEY);
    if (saved) {
      presets = JSON.parse(saved);
      if (!Array.isArray(presets)) presets = [];
    } else {
      presets = [];
    }
  } catch(e) {
    presets = [];
  }
  refreshPresetList();
}

function savePresets() {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch(e) {
    toast('保存预设失败: ' + e.message, 'error');
  }
  refreshPresetList();
}

function refreshPresetList() {
  const sel = document.getElementById('presetSelect');
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">-- 选择预设 --</option>';
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.note ? p.name + ' (' + p.note + ')' : p.name;
    sel.appendChild(opt);
  });
  if (currentVal && sel.querySelector('option[value="' + currentVal + '"]')) {
    sel.value = currentVal;
  }
}

function applyPresetSettings(settings) {
  if (settings.currentModel !== undefined) {
    currentModel = settings.currentModel;
    const sel = document.getElementById('modelSelect');
    if (sel) sel.value = currentModel;
    fetch('/api/model', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({model:currentModel}) }).catch(function(){});
  }
  if (settings.exportColWidth !== undefined) {
    exportColWidth = settings.exportColWidth;
    var slider = document.getElementById('exportColWidthSlider');
    var input = document.getElementById('exportColWidthInput');
    if (slider) slider.value = exportColWidth;
    if (input) input.value = exportColWidth;
  }
  if (settings.exportColWidths !== undefined) {
    exportColWidths = JSON.parse(JSON.stringify(settings.exportColWidths));
  }
  if (settings.exportRowHeight !== undefined) {
    exportRowHeight = settings.exportRowHeight;
    var slider = document.getElementById('exportRowHeightSlider');
    var input = document.getElementById('exportRowHeightInput');
    if (slider) slider.value = exportRowHeight;
    if (input) input.value = exportRowHeight;
  }
  if (settings.exportRowHeights !== undefined) {
    exportRowHeights = JSON.parse(JSON.stringify(settings.exportRowHeights));
  }
  if (settings.exportHeaderHeight !== undefined) {
    exportHeaderHeight = settings.exportHeaderHeight;
    var slider = document.getElementById('exportHeaderHeightSlider');
    var input = document.getElementById('exportHeaderHeightInput');
    if (slider) slider.value = exportHeaderHeight;
    if (input) input.value = exportHeaderHeight;
  }
  if (settings.currentFontWeight !== undefined) {
    currentFontWeight = settings.currentFontWeight;
    var sel = document.getElementById('fontWeightSelect');
    if (sel) sel.value = currentFontWeight;
  }
  if (settings.currentFontSize !== undefined) {
    currentFontSize = settings.currentFontSize;
    var slider = document.getElementById('fontSizeSlider');
    var input = document.getElementById('fontSizeInput');
    var preview = document.getElementById('fontSizePreview');
    if (slider) slider.value = currentFontSize;
    if (input) input.value = currentFontSize;
    if (preview) preview.style.fontSize = currentFontSize + 'px';
  }
  if (settings.currentHeaderFontSize !== undefined) {
    currentHeaderFontSize = settings.currentHeaderFontSize;
    var slider = document.getElementById('headerFontSizeSlider');
    var input = document.getElementById('headerFontSizeInput');
    var preview = document.getElementById('headerFontSizePreview');
    if (slider) slider.value = currentHeaderFontSize;
    if (input) input.value = currentHeaderFontSize;
    if (preview) preview.style.fontSize = currentHeaderFontSize + 'px';
  }
  if (settings.exportConfig !== undefined) {
    exportConfig = JSON.parse(JSON.stringify(settings.exportConfig));
    var bgW = document.getElementById('cfgBgWidth');
    var bgH = document.getElementById('cfgBgHeight');
    var pad = document.getElementById('cfgPadding');
    if (bgW) bgW.value = exportConfig.bgWidth;
    if (bgH) bgH.value = exportConfig.bgHeight;
    if (pad) pad.value = exportConfig.padding;
  }
  refreshFineTunePanel();
  refreshFineTuneRowPanel();
  applyExportColWidths();
  applyExportRowHeights();
  updateTableSizeIndicator();
  checkExportConfigWarning();
  refreshPreview();
}

function savePreset() {
  var name = prompt('请输入预设名称:');
  if (!name || !name.trim()) return;
  var nameTrimmed = name.trim();
  var note = prompt('请输入备注说明（可选，留空跳过）:');
  var noteTrimmed = note ? note.trim() : '';
  if (presets.some(function(p) { return p.name === nameTrimmed; })) {
    var overwrite = confirm('已存在同名预设"' + nameTrimmed + '"，是否覆盖？');
    if (!overwrite) return;
    presets = presets.filter(function(p) { return p.name !== nameTrimmed; });
  }
  var settings = {
    currentModel: currentModel,
    exportColWidth: exportColWidth,
    exportColWidths: JSON.parse(JSON.stringify(exportColWidths)),
    exportRowHeight: exportRowHeight,
    exportRowHeights: JSON.parse(JSON.stringify(exportRowHeights)),
    exportHeaderHeight: exportHeaderHeight,
    currentFontWeight: currentFontWeight,
    currentFontSize: currentFontSize,
    currentHeaderFontSize: currentHeaderFontSize,
    exportConfig: JSON.parse(JSON.stringify(exportConfig))
  };
  presets.push({ name: nameTrimmed, note: noteTrimmed, settings: settings });
  savePresets();
  toast('预设「' + nameTrimmed + '」已保存', 'success');
  var sel = document.getElementById('presetSelect');
  sel.value = presets.length - 1;
}

function loadPreset() {
  var sel = document.getElementById('presetSelect');
  var idx = parseInt(sel.value);
  if (isNaN(idx) || idx < 0 || idx >= presets.length) {
    toast('请先选择一个预设', 'error');
    return;
  }
  if (!resultData) {
    toast('请先识别尺码表后再加载预设', 'error');
    return;
  }
  var preset = presets[idx];
  applyPresetSettings(preset.settings);
  toast('预设「' + preset.name + '」已应用', 'success');
}

function deletePreset() {
  var sel = document.getElementById('presetSelect');
  var idx = parseInt(sel.value);
  if (isNaN(idx) || idx < 0 || idx >= presets.length) {
    toast('请先选择一个预设', 'error');
    return;
  }
  var preset = presets[idx];
  if (!confirm('确定要删除预设「' + preset.name + '」吗？')) return;
  presets.splice(idx, 1);
  savePresets();
  sel.value = '';
  toast('预设已删除', 'info');
}

function exportPresets() {
  if (presets.length === 0) {
    toast('没有预设可导出', 'error');
    return;
  }
  var blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'sizeflow_presets_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('导出了 ' + presets.length + ' 个预设', 'success');
}

function importPresets() {
  document.getElementById('presetFileInput').click();
}

function handlePresetFileImport(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) {
        toast('导入失败: 文件格式无效（需要JSON数组）', 'error');
        return;
      }
      var validCount = 0;
      imported.forEach(function(p) {
        if (p && p.name && p.settings && typeof p.settings === 'object') {
          var existing = presets.findIndex(function(ex) { return ex.name === p.name; });
          if (existing >= 0) {
            presets[existing] = p;
          } else {
            presets.push(p);
          }
          validCount++;
        }
      });
      if (validCount === 0) {
        toast('导入失败: 未找到有效的预设数据', 'error');
        return;
      }
      savePresets();
      toast('成功导入 ' + validCount + ' 个预设', 'success');
    } catch(err) {
      toast('导入失败: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ======== Splash Screen ========
(function(){
  const splash = document.getElementById('splash');
  if (splash) {
    const dismiss = () => { splash.style.opacity = '0'; splash.style.transition = 'opacity .3s'; setTimeout(() => splash.remove(), 350); };
    splash.addEventListener('click', dismiss);
    // 3 秒后自动消失
    setTimeout(dismiss, 4000);
  }
})();

// ======== Mouse glow ========
const glow = document.getElementById('cursor-glow');
const glowAmbient = document.getElementById('cursor-glow-ambient');
let mx = window.innerWidth / 2, my = window.innerHeight / 2;

document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

function updateGlow() {
  glow.style.left = mx + 'px';
  glow.style.top = my + 'px';
  glowAmbient.style.left = mx + 'px';
  glowAmbient.style.top = my + 'px';
  requestAnimationFrame(updateGlow);
}
requestAnimationFrame(updateGlow);

// Also move on touch for mobile
document.addEventListener('touchmove', e => {
  mx = e.touches[0].clientX;
  my = e.touches[0].clientY;
}, {passive: true});

// ======== Easter Egg Timer ========
let _easterTimer = null;
let _easterStart = 0;
let _easterMultiplier = 1;
function startEasterEggTimer() {
  const el = document.getElementById('easterEggTimer');
  if (!el) return;
  _easterStart = Date.now();
  _easterMultiplier = 1;
  el.textContent = '';
  _easterTimer = setInterval(() => {
    const realSec = (Date.now() - _easterStart) / 1000;
    // 前2秒正常，之后指数加速
    if (realSec > 2) _easterMultiplier = Math.pow(realSec - 1, 8);
    const fakeSec = Math.floor(realSec * Math.max(1, _easterMultiplier));
    if (fakeSec < 60) {
      el.textContent = '(已耗时: ' + fakeSec + ' 秒)';
    } else if (fakeSec < 3600) {
      el.textContent = '(已耗时: ' + Math.floor(fakeSec/60) + ' 分 ' + (fakeSec%60) + ' 秒)';
    } else {
      el.textContent = '(已耗时: ' + Math.floor(fakeSec/3600) + ' 小时 ' + Math.floor((fakeSec%3600)/60) + ' 分)';
    }
  }, 160);
}
function stopEasterEggTimer() {
  if (_easterTimer) { clearInterval(_easterTimer); _easterTimer = null; }
  const el = document.getElementById('easterEggTimer');
  if (el) el.textContent = '';
}

// ======== Uptime ========
(function(){
  var START = new Date('2026-05-14T16:38:00+08:00');
  var el = document.getElementById('uptime');
  if (!el) return;
  function pad(n){ return n<10?'0'+n:''+n; }
  function tick(){
    var d=Math.max(0,Date.now()-START.getTime());
    var s=Math.floor(d/1000),day=Math.floor(s/86400);s%=86400;
    var hr=Math.floor(s/3600);s%=3600;
    var min=Math.floor(s/60);s%=60;
    el.textContent=day+'天 '+pad(hr)+'时 '+pad(min)+'分 '+pad(s)+'秒';
  }
  tick();
  setInterval(tick,1000);
})();

// ======== Size Chart Sessions ========
var SC_SESS_KEY = 'sizeflow_sc_sessions', _scSessions = [];

function loadSCSessions(){ try{ var s=localStorage.getItem(SC_SESS_KEY); if(s){ _scSessions=JSON.parse(s); if(!Array.isArray(_scSessions))_scSessions=[]; } }catch(e){ _scSessions=[]; } renderSCSessionList(); }
function saveSCSessions(){ try{ if(_scSessions.length>30)_scSessions=_scSessions.slice(0,30); localStorage.setItem(SC_SESS_KEY,JSON.stringify(_scSessions)); }catch(e){} renderSCSessionList(); }

function saveSCSession(){
  if(!resultData||!resultData.headers)return;
  var id='sc_'+Date.now()+'_'+Math.random().toString(36).substr(2,6);
  var imgRef=null;
  var b64=currentImage||currentImageB64;
  var savePromise=b64?IDB.put(id+'_img',b64).then(function(){ imgRef=id+'_img'; }):Promise.resolve();
  savePromise.then(function(){
    _scSessions.unshift({id:id,time:new Date().toISOString(),mappings:JSON.parse(JSON.stringify(mappings)),model:typeof currentModel!=='undefined'?currentModel:'',resultData:JSON.parse(JSON.stringify(resultData)),imgRef:imgRef});
    saveSCSessions();
  }).catch(function(e){ console.error('Save SC session:',e); });
}

function loadSCSession(idx){
  var h=_scSessions[idx]; if(!h)return;
  if(h.imgRef){ IDB.get(h.imgRef).then(function(b64){ if(b64){ currentImage=b64; currentImageB64=b64; showPreview(b64); } }); }
  if(h.resultData){ resultData=h.resultData; renderTable(resultData); document.getElementById('resultCard').classList.remove('hidden'); document.getElementById('styleCard').classList.remove('hidden'); }
  if(h.mappings&&typeof mappings!=='undefined'){ mappings=h.mappings; saveMappings(); renderMappings(); }
  if(h.model&&typeof currentModel!=='undefined'){ currentModel=h.model; var m=document.getElementById('modelSelect'); if(m)m.value=h.model; fetch('/api/model',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:h.model})}).catch(function(){}); }
  if(typeof toast==='function')toast('会话已恢复','success');
}

function deleteSCSession(idx){
  var h=_scSessions[idx]; if(!h)return;
  if(h.imgRef)IDB.del(h.imgRef);
  _scSessions.splice(idx,1); saveSCSessions();
  if(typeof toast==='function')toast('会话已删除','info');
}

function renderSCSessionList(){
  var list=document.getElementById('scHistoryList'); if(!list)return;
  if(_scSessions.length===0){ list.innerHTML='<div style="color:var(--text2);font-size:12px;padding:12px;">暂无历史会话</div>'; return; }
  list.innerHTML=_scSessions.map(function(h,i){
    var ts=h.time?new Date(h.time):null, timeStr=ts?timeAgo(Math.floor(ts.getTime()/1000)):'';
    var headers=h.resultData&&h.resultData.headers?h.resultData.headers.join(', '):'';
    return '<div class="sc-history-item" style="padding:10px 14px;margin:4px 0;border-radius:10px;background:rgba(255,255,255,.08);cursor:pointer;transition:all .2s;position:relative;" onclick="loadSCSession('+i+')" onmouseover="this.style.background=\'rgba(255,255,255,.15)\'" onmouseout="this.style.background=\'rgba(255,255,255,.08)\'">'+
      '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--text2);">'+timeStr+'</span>'+(h.imgRef?'<span style="font-size:10px;color:var(--success);background:rgba(46,168,122,.12);padding:1px 6px;border-radius:4px;">📷</span>':'')+'<span style="flex:1;"></span><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();deleteSCSession('+i+');" style="padding:1px 6px;font-size:10px;" title="删除此会话">🗑</button></div>'+
      '<div style="font-size:12px;color:var(--text);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(headers||'(无数据)')+'</div></div>';
  }).join('')+'<div style="font-size:11px;color:var(--text2);text-align:center;padding:8px;">共 '+_scSessions.length+' 条会话</div>';
}

// ======== Start ========
init();
