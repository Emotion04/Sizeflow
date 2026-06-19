/* Sizeflow 广告卡片 — 螃蟹躲避鼠标交互
   提取自 index.html (原 lines 608-657) */

(function() {
  var card = document.getElementById('adCard');
  var crab = document.getElementById('adCrab');
  if (!card || !crab) return;
  var ox = 0, oy = 0, avoiding = false;
  card.addEventListener('mousemove', function(e) {
    var rect = crab.getBoundingClientRect();
    var cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    var dx = e.clientX - cx, dy = e.clientY - cy;
    var dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 80) {
      avoiding = true;
      var angle = Math.atan2(dy, dx) + Math.PI;
      ox = Math.cos(angle) * Math.min(24, (80-dist)*0.6);
      oy = Math.sin(angle) * Math.min(24, (80-dist)*0.6);
      crab.style.transform = 'translate(' + ox + 'px,' + oy + 'px)';
    } else if (avoiding) {
      avoiding = false;
      ox *= 0.6; oy *= 0.6;
      if (Math.abs(ox) < 0.5 && Math.abs(oy) < 0.5) {
        ox = 0; oy = 0;
        crab.style.transform = 'translate(0,0)';
      } else {
        crab.style.transform = 'translate(' + ox + 'px,' + oy + 'px)';
      }
    }
  });
  card.addEventListener('mouseleave', function() {
    crab.style.transform = 'translate(0,0)';
    ox = 0; oy = 0; avoiding = false;
  });
  var clicks = 0;
  crab.addEventListener('click', function(e) {
    e.stopPropagation();
    clicks++;
    var r = clicks % 3;
    if (r === 0) crab.textContent = '🦀';
    else if (r === 1) crab.textContent = '🥀';
    else crab.textContent = '🧐';
    crab.style.transform = 'scale(1.3) rotate(20deg)';
    setTimeout(function() {
      crab.style.transform = 'scale(1) rotate(0deg)';
    }, 200);
  });
  card.addEventListener('click', function() {
    window.location.href = 'mailto:infpc@msn.com';
  });
})();
