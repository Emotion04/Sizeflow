/* Sizeflow 反馈星球 — 纯粒子悬浮球 + 反馈卡片 */

const FB = {
  _size: 96, _r: 32,  // Canvas 96×96 防止粒子裁切，球心在 48,48，球半径 32
  _cx: 48, _cy: 48,
  _x: 0, _y: 0, _tx: 0, _ty: 0, _vx: 0, _vy: 0,
  _dragging: false, _dragOX: 0, _dragOY: 0,
  _particles: [], _cardOpen: false,
  _animId: null, _inited: false,
  _canvas: null, _ctx: null, _wrap: null,

  init() {
    if (this._inited) return; this._inited = true;

    // 初始位置右下
    const labelH = 24;
    this._x = this._tx = window.innerWidth - this._size - 20;
    this._y = this._ty = window.innerHeight - this._size - labelH - 20;

    this._createPlanet();
    this._createCard();
    this._bindPlanet();
    this._bindCard();
    this._bindTab();
    this._spawnOrbiters();
    this._tick();
  },

  // ========== 星球创建 ==========

  _createPlanet() {
    const wrap = document.createElement('div'); wrap.id = 'fbPlanet';
    wrap.style.cssText = `position:fixed;z-index:9999;width:${this._size}px;height:${this._size + 24}px;cursor:grab;display:flex;flex-direction:column;align-items:center;`;
    const c = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    c.width = this._size * dpr; c.height = this._size * dpr;
    c.style.width = this._size + 'px'; c.style.height = this._size + 'px';
    wrap.appendChild(c);

    // 流光文字标签
    const label = document.createElement('span');
    label.textContent = '反馈问题';
    label.style.cssText = 'font-size:11px;font-weight:500;margin-top:2px;letter-spacing:2px;background:linear-gradient(90deg,#8888cc,#aaccff,#88ccff,#aaccff,#8888cc);background-size:200% 100%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:fbShimmer 2.5s linear infinite;user-select:none;';
    wrap.appendChild(label);

    document.body.appendChild(wrap);
    this._canvas = c; this._ctx = c.getContext('2d');
    this._dpr = dpr; this._wrap = wrap;

    // 注入 keyframes（如果还没有）
    if (!document.getElementById('fbShimmerStyle')) {
      const style = document.createElement('style');
      style.id = 'fbShimmerStyle';
      style.textContent = '@keyframes fbShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
      document.head.appendChild(style);
    }
  },

  _spawnOrbiters() {
    for (let i = 0; i < 80; i++) {
      this._particles.push(this._newOrbiter());
    }
  },

  _newOrbiter() {
    const angle = Math.random() * Math.PI * 2;
    const dist = this._r * (0.45 + Math.random() * 1.0);  // max ~46px, 在96px canvas内安全
    return {
      x: 0, y: 0,
      angle, dist,
      speed: 0.002 + Math.random() * 0.015,
      size: 0.6 + Math.random() * 2.2,
      alpha: 0.3 + Math.random() * 0.7,
      hue: 200 + Math.random() * 60,
      phase: Math.random() * Math.PI * 2,
      oscillation: 0.3 + Math.random() * 0.7,
    };
  },

  _drawPlanet() {
    const ctx = this._ctx, r = this._r, cx = this._cx, cy = this._cy;

    ctx.clearRect(0, 0, this._size, this._size);

    // === 轨道粒子 ===
    this._particles.forEach(p => {
      const a = p.angle;
      const ox = Math.cos(a) * p.dist;
      const oy = Math.sin(a) * p.dist * 0.6 + Math.sin(a * 3 + p.phase) * p.dist * p.oscillation * 0.3;
      p.angle += p.speed;

      const d = Math.sqrt(ox * ox + oy * oy);
      if (d < r * 0.4) return;

      const px = cx + ox, py = cy + oy;
      ctx.globalAlpha = p.alpha * 0.6;
      ctx.fillStyle = `hsl(${p.hue},80%,70%)`;
      ctx.shadowColor = `hsl(${p.hue},100%,60%)`;
      ctx.shadowBlur = p.size * 2;
      ctx.beginPath(); ctx.arc(px, py, p.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // === 核心发光 ===
    const coreGrad = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r * 0.45);
    coreGrad.addColorStop(0, 'rgba(255,255,255,1)');
    coreGrad.addColorStop(0.1, 'rgba(200,220,255,0.9)');
    coreGrad.addColorStop(0.3, 'rgba(100,150,255,0.5)');
    coreGrad.addColorStop(0.6, 'rgba(50,80,200,0.1)');
    coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2); ctx.fill();

    // 亮白光点
    const hotGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.12);
    hotGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
    hotGrad.addColorStop(0.5, 'rgba(200,220,255,0.3)');
    hotGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hotGrad;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2); ctx.fill();

    // 细环
    ctx.strokeStyle = 'rgba(140,170,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.15, r * 0.35, -0.35, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,190,255,0.12)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.25, r * 0.38, -0.3, 0, Math.PI * 2); ctx.stroke();
  },

  // ========== 拖尾粒子（惯性拖拽时产生） ==========

  _trailParticles: [],
  _lastTX: 0, _lastTY: 0,

  _spawnTrail() {
    const dx = this._x - this._lastTX, dy = this._y - this._lastTY;
    const spd = Math.sqrt(dx * dx + dy * dy);
    if (spd < 3) return;
    const n = Math.min(Math.floor(spd / 2), 15);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      this._trailParticles.push({
        x: this._lastTX + dx * t + this._cx,
        y: this._lastTY + dy * t + this._cy,
        vx: -dx * 0.03 + (Math.random() - 0.5),
        vy: -dy * 0.03 + (Math.random() - 0.5),
        life: 1, decay: 0.015 + Math.random() * 0.04,
        size: 0.8 + Math.random() * 2,
        hue: 220 + Math.random() * 40,
      });
    }
    this._lastTX = this._x; this._lastTY = this._y;
    if (this._trailParticles.length > 120) this._trailParticles.splice(0, this._trailParticles.length - 120);
  },

  // ========== 动画循环 ==========

  _tick() {
    // 惯性缓动
    if (!this._dragging) {
      const f = 0.9, s = 0.12;
      this._vx = this._vx * f + (this._tx - this._x) * s;
      this._vy = this._vy * f + (this._ty - this._y) * s;
      this._x += this._vx; this._y += this._vy;
    } else {
      this._vx = 0; this._vy = 0;
    }

    this._spawnTrail();

    // 更新拖尾
    for (let i = this._trailParticles.length - 1; i >= 0; i--) {
      const p = this._trailParticles[i];
      p.x += p.vx; p.y += p.vy; p.life -= p.decay;
      if (p.life <= 0) this._trailParticles.splice(i, 1);
    }

    // 更新星球位置
    this._wrap.style.left = this._x + 'px';
    this._wrap.style.top = this._y + 'px';

    // 绘制星球
    this._drawPlanet();

    // 绘制拖尾层
    this._drawTrailLayer();

    this._animId = requestAnimationFrame(() => this._tick());
  },

  _trailCanvas: null,

  _drawTrailLayer() {
    if (this._trailParticles.length === 0) {
      if (this._trailCanvas) { this._trailCanvas.remove(); this._trailCanvas = null; }
      return;
    }
    if (!this._trailCanvas) {
      this._trailCanvas = document.createElement('canvas');
      this._trailCanvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:9998;';
      this._trailCanvas.width = window.innerWidth;
      this._trailCanvas.height = window.innerHeight;
      document.body.appendChild(this._trailCanvas);
    }
    const ctx = this._trailCanvas.getContext('2d');
    ctx.clearRect(0, 0, this._trailCanvas.width, this._trailCanvas.height);
    this._trailParticles.forEach(p => {
      ctx.globalAlpha = p.life * 0.7;
      ctx.fillStyle = `hsl(${p.hue},90%,70%)`;
      ctx.shadowColor = `hsl(${p.hue},100%,55%)`;
      ctx.shadowBlur = p.size * 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 0;
  },

  _snapToEdge() {
    const m = 16, w = window.innerWidth, h = window.innerHeight, s = this._size + 24; // +24 for text label
    const dl = this._x, dr = w - this._x - this._size, dt = this._y, db = h - this._y - s;
    const min = Math.min(dl, dr, dt, db);
    if (min === dt) this._ty = m;
    else if (min === db) this._ty = h - s - m;
    else if (min === dl) this._tx = m;
    else this._tx = w - this._size - m;
  },

  // ========== 星球拖拽 ==========

  _bindPlanet() {
    this._wrap.addEventListener('pointerdown', e => {
      this._dragging = true;
      this._dragOX = e.clientX - this._x;
      this._dragOY = e.clientY - this._y;
      this._vx = 0; this._vy = 0;
      this._lastTX = this._x; this._lastTY = this._y;
      this._wrap.style.cursor = 'grabbing';
      e.preventDefault(); e.stopPropagation();
    });
    window.addEventListener('pointermove', e => {
      if (!this._dragging) return;
      this._x = e.clientX - this._dragOX;
      this._y = e.clientY - this._dragOY;
      this._tx = this._x; this._ty = this._y;
    });
    window.addEventListener('pointerup', e => {
      if (!this._dragging) return;
      const moved = Math.abs(e.clientX - this._dragOX - this._x) + Math.abs(e.clientY - this._dragOY - this._y);
      this._dragging = false;
      this._wrap.style.cursor = 'grab';
      this._vx = (this._x - this._tx) * 0.05;
      this._vy = (this._y - this._ty) * 0.05;
      if (moved < 4) this._toggleCard();
      else setTimeout(() => this._snapToEdge(), 600);
    });
  },

  // ========== Feedback card ==========

  _createCard() {
    const card = document.createElement('div'); card.id = 'fbCard';
    card.innerHTML = '<button class="fb-close">&times;</button><h3><span class="dot"></span>Submit Feedback</h3><div class="fb-row"><button class="fb-type active" data-type="feedback">Feedback</button><button class="fb-type" data-type="bug">Bug</button></div><textarea id="fbText" placeholder="Describe your issue or suggestion..."></textarea><button class="fb-submit" id="fbSubmit">Submit</button><div class="fb-result" id="fbResult"></div>';
    document.body.appendChild(card);
  },

  _bindCard() {
    const card = document.getElementById('fbCard');
    if (!card) return;
    card.querySelectorAll('.fb-type').forEach(b => {
      b.addEventListener('click', () => {
        card.querySelectorAll('.fb-type').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
    card.querySelector('.fb-close').addEventListener('click', () => this._hideCard());
    document.getElementById('fbSubmit').addEventListener('click', () => this._submit());
    document.addEventListener('click', e => {
      if (!this._cardOpen) return;
      if (!card.contains(e.target) && !this._wrap.contains(e.target) && e.target.id !== 'spiFeedbackTab') {
        this._hideCard();
      }
    });
  },

  _bindTab() {
    const tab = document.getElementById('spiFeedbackTab');
    if (tab) tab.addEventListener('click', () => { this._showCard(); });
  },

  _toggleCard() { this._cardOpen ? this._hideCard() : this._showCard(); },

  _showCard() {
    this._cardOpen = true;
    const card = document.getElementById('fbCard');
    if (!card) return;
    card.style.left = Math.max(10, Math.min(this._x + this._size + 8, window.innerWidth - 360)) + 'px';
    card.style.top = Math.max(10, Math.min(this._y, window.innerHeight - 460)) + 'px';
    card.style.display = 'flex';
    setTimeout(() => { const t = document.getElementById('fbText'); if (t) t.focus(); }, 100);
  },

  _hideCard() {
    this._cardOpen = false;
    const card = document.getElementById('fbCard');
    if (!card) return;

    const cr = card.getBoundingClientRect();
    const tx = (this._x + this._cx) - (cr.left + cr.width / 2);
    const ty = (this._y + this._cy) - (cr.top + cr.height / 2);
    const sign = ty > 0 ? 1 : -1;

    card.style.transition = 'opacity .25s, transform .25s';
    card.style.opacity = '0';
    card.style.transform = 'scale(.95)';
    setTimeout(() => { card.style.display = 'none'; card.style.opacity = ''; card.style.transform = ''; }, 280);
  },

  async _submit() {
    const btn = document.getElementById('fbSubmit'), res = document.getElementById('fbResult');
    const text = document.getElementById('fbText').value.trim();
    if (!text) { res.textContent = '请输入内容'; res.className = 'fb-result err'; return; }
    const typeBtn = document.querySelector('#fbCard .fb-type.active');
    const type = typeBtn ? typeBtn.dataset.type : 'feedback';
    btn.disabled = true; btn.textContent = '提交中...'; res.textContent = ''; res.className = 'fb-result';
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, text }),
      });
      const d = await r.json();
      if (d.success) {
        res.textContent = '✅ 已提交，感谢反馈！';
        res.className = 'fb-result ok';
        document.getElementById('fbText').value = '';
        setTimeout(() => this._hideCard(), 2000);
      } else { throw new Error(d.error || '失败'); }
    } catch (e) {
      res.textContent = '❌ ' + e.message;
      res.className = 'fb-result err';
    } finally { btn.disabled = false; btn.textContent = '🚀 提交反馈'; }
  },
};

window.addEventListener('DOMContentLoaded', () => FB.init());
