/* Token Counter — 顶栏累计 + 当次操作 */
var TK = {
  _total: 0, _key: 'sizeflow_tokens',
  _lastEl: null, _totalEl: null, _timer: null,

  init: function() {
    this._lastEl = document.getElementById('tokenLast');
    this._totalEl = document.getElementById('tokenTotal');
    try { var s = localStorage.getItem(this._key); if (s) this._total = parseInt(s) || 0; } catch(e) {}
    this._renderTotal();
  },

  add: function(input, output) {
    var sum = (input || 0) + (output || 0);
    if (sum <= 0) return;
    // 当次操作显示
    var self = this;
    if (this._lastEl) {
      this._lastEl.textContent = '+' + sum;
      this._lastEl.style.opacity = '1';
      clearTimeout(this._timer);
      this._timer = setTimeout(function() { self._lastEl.style.opacity = '0'; }, 2000);
    }
    // 累计增加
    var old = this._total;
    this._total += sum;
    this._save();
    this._animateTotal(old, this._total);
  },

  _save: function() {
    try { localStorage.setItem(this._key, String(this._total)); } catch(e) {}
  },

  _renderTotal: function() {
    if (this._totalEl) this._totalEl.textContent = '💰 ' + this._fmt(this._total);
  },

  _animateTotal: function(from, to) {
    var self = this;
    var d = to - from, steps = Math.min(30, Math.max(10, Math.ceil(d / 50)));
    if (steps <= 0) { this._renderTotal(); return; }
    var i = 0, interval = Math.max(20, Math.floor(1000 / steps));
    var timer = setInterval(function() {
      i++;
      var v = Math.round(from + d * (i / steps));
      if (self._totalEl) self._totalEl.textContent = '💰 ' + self._fmt(v) + ' ↑';
      if (i >= steps) {
        clearInterval(timer);
        self._renderTotal();
      }
    }, interval);
  },

  _fmt: function(n) { if (n < 1000) return String(n); if (n < 10000) return (n/1000).toFixed(1) + 'k'; if (n < 1000000) return Math.round(n/1000) + 'k'; return (n/1000000).toFixed(1) + 'M'; }
};
TK.init();
