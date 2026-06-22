/* Token Counter — 流式计数 + 总累计 */
var TK = {
  _total: 0, _key: 'sizeflow_tokens',
  _streamEl: null, _totalEl: null,
  _streamVal: 0, _timer: null,

  init: function() {
    this._totalEl = document.getElementById('tokenTotal');
    this._streamEl = document.getElementById('tokenStream');
    try { var s = localStorage.getItem(this._key); if (s) this._total = parseInt(s) || 0; } catch(e) {}
    this._renderTotal();
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
    // streamEl 显示最终值 + 绿色加号
    if (this._streamEl) {
      this._streamEl.textContent = this._fmt(finalVal);
      this._streamEl.innerHTML += '<span style="color:#2ea87a;font-size:13px;font-weight:700;animation:tkPlusIn .4s ease;"> +</span>';
      clearTimeout(this._timer);
      this._timer = setTimeout(function() { if(self._streamEl)self._streamEl.textContent=''; }, 2000);
    }
    // 总计数器动画
    var old = this._total;
    this._total += finalVal;
    this._save();
    this._animateTotal(old, this._total);
  },

  _save: function() {
    try { localStorage.setItem(this._key, String(this._total)); } catch(e) {}
  },

  _renderTotal: function() {
    if (this._totalEl) this._totalEl.textContent = this._fmt(this._total);
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
      if (self._totalEl) self._totalEl.textContent = self._fmt(v);
      if (i >= steps) { clearInterval(timer); self._renderTotal(); }
    }, interval);
  },

  _fmt: function(n) { if (n < 1000) return String(n); if (n < 10000) return (n/1000).toFixed(1)+'k'; if (n < 1000000) return Math.round(n/1000)+'k'; return (n/1000000).toFixed(1)+'M'; }
};
TK.init();
