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
    // 当次实时更新
    if (this._lastEl) {
      this._lastEl.textContent = '+' + sum;
      this._lastEl.style.opacity = '1';
      clearTimeout(this._timer);
    }
    // 立即累计
    this._total += sum;
    this._save();
    this._renderTotal();
  },

  done: function() {
    // 本次数字停留2秒后渐隐
    var self = this;
    if (this._lastEl) {
      clearTimeout(this._timer);
      this._timer = setTimeout(function() { self._lastEl.style.opacity = '0'; }, 2000);
    }
  },

  _save: function() {
    try { localStorage.setItem(this._key, String(this._total)); } catch(e) {}
  },

  _renderTotal: function() {
    if (this._totalEl) this._totalEl.textContent = this._fmt(this._total);
  },

  _fmt: function(n) { if (n < 1000) return String(n); if (n < 10000) return (n/1000).toFixed(1) + 'k'; if (n < 1000000) return Math.round(n/1000) + 'k'; return (n/1000000).toFixed(1) + 'M'; }
};
TK.init();
