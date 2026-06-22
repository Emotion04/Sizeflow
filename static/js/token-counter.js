/* Token Counter — 实时计数器 + 本次总计 + 总计数器 */
var TK = {
  _total: 0, _key: 'sizeflow_tokens',
  _streamEl: null, _opEl: null, _totalEl: null,
  _streamVal: 0, _opVal: 0, _timer: null,

  init: function() {
    this._totalEl = document.getElementById('tokenTotal');
    this._streamEl = document.getElementById('tokenStream');
    this._opEl = document.getElementById('tokenOp');
    try { var s = localStorage.getItem(this._key); if (s) this._total = parseInt(s) || 0; } catch(e) {}
    this._renderTotal();
  },

  // 流式: 实时增加（每N个token调用一次）
  streamAdd: function(n) {
    this._streamVal += n;
    if (this._streamEl) this._streamEl.textContent = this._fmt(this._streamVal);
  },

  // 流式结束: 保存本次总计，准备动画
  streamDone: function() {
    var self = this;
    this._opVal = this._streamVal;
    this._streamVal = 0;
    // 流式数字停留2s后渐隐
    if (this._streamEl) {
      clearTimeout(this._timer);
      this._timer = setTimeout(function() { if(self._streamEl)self._streamEl.textContent=''; }, 2000);
    }
    // 显示本次总计 +N
    if (this._opEl) {
      this._opEl.textContent = '+' + this._fmt(this._opVal);
      this._opEl.style.opacity = '1';
      // 主计数器动画: 从旧值跳到新值
      this._animateTotal(this._total, this._total + this._opVal);
    }
  },

  // 最终确认: 更新总计数器
  // 非流式: 直接计入
  addOnce: function(input, output) {
    var sum = (input||0)+(output||0);
    if(sum<=0)return;
    this._opVal=sum; this._streamVal=0;
    if(this._opEl){ this._opEl.textContent='+'+this._fmt(sum); this._opEl.style.opacity='1'; }
    this._animateTotal(this._total, this._total+sum);
  },

  finalize: function() {
    this._total += this._opVal;
    this._save();
    this._renderTotal();
    // 本次总计停留后渐隐
    var self = this;
    clearTimeout(this._timer);
    this._timer = setTimeout(function() { if(self._opEl)self._opEl.style.opacity='0'; }, 2500);
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
    if (d <= 0) return;
    var steps = Math.min(30, Math.max(10, Math.ceil(d / 30)));
    var i = 0, interval = Math.max(15, Math.floor(800 / steps));
    var timer = setInterval(function() {
      i++;
      var v = Math.round(from + d * (i / steps));
      if (self._totalEl) self._totalEl.textContent = self._fmt(v);
      if (i >= steps) { clearInterval(timer); self.finalize(); }
    }, interval);
  },

  _fmt: function(n) { if (n < 1000) return String(n); if (n < 10000) return (n/1000).toFixed(1)+'k'; if (n < 1000000) return Math.round(n/1000)+'k'; return (n/1000000).toFixed(1)+'M'; }
};
TK.init();
