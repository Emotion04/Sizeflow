/* Token Counter — 流式计数 + 总累计 + IP 统计 */
var TK = {
  _total: 0, _key: 'sizeflow_tokens', _statsKey: 'sizeflow_tk_stats',
  _streamEl: null, _totalEl: null, _popup: null, _pill: null,
  _streamVal: 0, _timer: null, _ip: '', _stats: {},

  init: function() {
    this._totalEl = document.getElementById('tokenTotal');
    this._streamEl = document.getElementById('tokenStream');
    this._popup = document.getElementById('tokenPopup');
    this._pill = document.getElementById('tokenPill');
    try { var s = localStorage.getItem(this._key); if (s) this._total = parseInt(s) || 0; } catch(e) {}
    try { var st = localStorage.getItem(this._statsKey); if (st) this._stats = JSON.parse(st); } catch(e) {}
    this._renderTotal();
    this._fetchIP();
    // hover
    var self = this;
    if (this._pill) {
      this._pill.addEventListener('mouseenter', function() { self._showPopup(); });
      this._pill.addEventListener('mouseleave', function() { self._popup.classList.add('hidden'); });
    }
  },

  _fetchIP: function() {
    var self = this;
    fetch('https://api.ipify.org?format=json').then(function(r){return r.json();}).then(function(d){
      self._ip = d.ip; self._updateStats();
    }).catch(function(){ self._ip = 'unknown'; });
  },

  _updateStats: function() {
    var ip = this._ip || 'unknown';
    if (!this._stats[ip]) this._stats[ip] = { total: 0, today: 0, month: 0, todayDate: '', monthKey: '' };
    var s = this._stats[ip];
    var now = new Date();
    var todayStr = now.getFullYear()+'-'+(now.getMonth()+1)+'-'+now.getDate();
    var monthStr = now.getFullYear()+'-'+(now.getMonth()+1);
    if (s.todayDate !== todayStr) { s.today = 0; s.todayDate = todayStr; }
    if (s.monthKey !== monthStr) { s.month = 0; s.monthKey = monthStr; }
  },

  // 流式实时加
  streamAdd: function(n) {
    this._streamVal += n;
    if (this._streamEl) this._streamEl.textContent = this._fmt(this._streamVal);
  },

  // 流式结束/非流式计入
  streamDone: function(input, output) {
    var self = this;
    var finalVal = (input||0)+(output||0);
    if (finalVal <= 0) finalVal = this._streamVal;
    if (finalVal <= 0) return;
    // green plus
    if (this._streamEl) {
      this._streamEl.textContent = this._fmt(finalVal);
      this._streamEl.innerHTML += '<span style="color:#2ea87a;font-size:13px;font-weight:700;animation:tkPlusIn .4s ease;"> +</span>';
      clearTimeout(this._timer);
      this._timer = setTimeout(function() { if(self._streamEl)self._streamEl.textContent=''; }, 2000);
    }
    // 累计
    var old = this._total;
    this._total += finalVal;
    this._save();
    this._animateTotal(old, this._total);
    // 更新 IP 统计
    this._updateStats();
    var ip = this._ip || 'unknown';
    if (!this._stats[ip]) this._stats[ip] = { total: 0, today: 0, month: 0 };
    this._stats[ip].total += finalVal;
    this._stats[ip].today += finalVal;
    this._stats[ip].month += finalVal;
    try { localStorage.setItem(this._statsKey, JSON.stringify(this._stats)); } catch(e) {}
  },

  _save: function() {
    try { localStorage.setItem(this._key, String(this._total)); } catch(e) {}
  },

  _renderTotal: function() {
    if (this._totalEl) this._totalEl.textContent = 'Token: ' + this._fmt(this._total);
  },

  _animateTotal: function(from, to) {
    var self = this;
    var d = to - from;
    if (d <= 0) { this._renderTotal(); return; }
    var steps = Math.min(25, Math.max(8, Math.ceil(d / 20)));
    var i = 0, interval = Math.max(20, Math.floor(600 / steps));
    var timer = setInterval(function() {
      i++;
      var v = Math.round(from + d * (i / steps));
      if (self._totalEl) self._totalEl.textContent = 'Token: ' + self._fmt(v);
      if (i >= steps) { clearInterval(timer); self._renderTotal(); }
    }, interval);
  },

  _showPopup: function() {
    var ip = this._ip || '...';
    this._updateStats();
    var s = this._stats[ip] || { total: 0, today: 0, month: 0 };
    var ips = Object.keys(this._stats).sort(function(a,b){ return (this._stats[b].total||0) - (this._stats[a].total||0); }.bind(this));
    var ipList = ips.slice(0, 5).map(function(k){ var isMe = k === ip; return '<div style="'+(isMe?'color:var(--primary);font-weight:600;':'color:var(--text2);')+'">' + TK._esc(k) + ': <b>' + TK._fmt(TK._stats[k].total||0) + '</b></div>'; }).join('');
    this._popup.innerHTML =
      '<div style="font-weight:600;margin-bottom:4px;">Token 统计</div>' +
      '<div style="font-size:12px;line-height:1.8;">' +
      'Total: <b>' + this._fmt(this._total) + '</b><br>' +
      'Today: <b>' + this._fmt(s.today||0) + '</b><br>' +
      'Month: <b>' + this._fmt(s.month||0) + '</b><br>' +
      '<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(0,0,0,.08);font-size:11px;color:var(--text2);">IP:</div>' +
      ipList + '</div>';
    this._popup.classList.remove('hidden');
  },
  _esc: function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },

  _fmt: function(n) { if (n < 1000) return String(n); if (n < 10000) return (n/1000).toFixed(1)+'k'; if (n < 1000000) return Math.round(n/1000)+'k'; return (n/1000000).toFixed(1)+'M'; }
};
TK.init();
