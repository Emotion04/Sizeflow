/* Sizeflow 文案生成模块 */
const CW = {
  productImages: {}, sizeDataSource: 'existing', sizeData: null, _rawOcrText: null,
  waistInfo: null, manualTags: [], versionCount: 3, currentModel: 'qwen3-vl-flash',
  generatedCopies: null, isGenerating: false, _selWaistIdx: 0, _lastError: '',

  _injected: false, _eventsBound: false,
  init() { if(!this._injected){ this._injectHTML(); this._injected=true; } if(!this._eventsBound){ this._bindEvents(); this._eventsBound=true; } this._bindSlots();
    if (typeof currentModel !== 'undefined') this.currentModel = currentModel; },
  activate() { this._renderAllSlots(); this._tryReadRaw(); if (typeof resultData !== 'undefined' && resultData) { this.sizeData = resultData; this._updateSizeSourceUI(); } else { this._detectWaist(); this._renderWaist(); } },
  deactivate() {},
  _tryReadRaw() { var e = document.getElementById('rawResponse'); if (e && e.textContent && e.textContent !== '(无)') this._rawOcrText = e.textContent; },

  // ======== HTML ========
  _injectHTML() {
    var c = document.getElementById('cwContent'); if (!c) return;
    c.innerHTML =
'<div id="cwUploadCard" class="card">'+
'<div class="card-title"><span class="icon">📷</span>素材上传</div>'+
'<div class="cw-upload-row"><div class="cw-upload-col">'+
'<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;">裤子图片</div>'+
'<div class="cw-image-slots" id="cwImageSlots">'+this._slot(0)+this._slot(1)+'</div></div>'+
'<div class="cw-upload-col">'+
'<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;">尺码数据</div>'+
'<div class="cw-size-tabs" id="cwSizeTabs"><button class="cw-size-tab active" id="cwTabExist" onclick="CW._onSizeTab(\x27existing\x27)">📋 尺码表结果</button><button class="cw-size-tab" id="cwTabUpload" onclick="CW._onSizeTab(\x27upload\x27)">📏 上传识别</button></div>'+
'<div id="cwSizeUp" class="upload-zone hidden" style="padding:30px 20px;margin-top:8px;"><div class="icon">📏</div><div>拖拽或点击上传尺码表</div><input type="file" id="cwSizeFile" accept="image/*" style="display:none;"></div>'+
'<div id="cwSizeSt" style="font-size:12px;color:var(--text2);margin-top:6px;"></div>'+
'<div class="cw-orbit-ring hidden" id="cwOrbit"><div class="orbit-track"><div class="orbit-dot"></div><div class="orbit-dot"></div><div class="orbit-dot"></div><div class="orbit-dot"></div><div class="orbit-dot"></div></div><div class="orbit-center"></div></div>'+
'<div class="cw-waist-row" style="display:flex;align-items:center;gap:10px;margin-top:10px;padding:8px 12px;background:rgba(255,255,255,.08);border-radius:8px;border:1px solid rgba(255,255,255,.15);">'+
'<span style="color:var(--text);font-size:14px;font-weight:600;">📐 腰型：</span><span id="cwWB" class="cw-waist-badge unknown" style="font-size:14px;padding:4px 12px;">未知</span><span id="cwWD" style="font-size:13px;color:var(--text2);"></span>'+
'<select id="cwWSize" style="margin-left:4px;padding:5px 10px;border:1px solid rgba(255,255,255,.25);border-radius:6px;font-size:13px;background:rgba(255,255,255,.12);color:var(--text);display:none;" onchange="CW._onWSize()"><option value="">选择尺码</option></select>'+
'<select id="cWOverride" style="margin-left:4px;padding:6px 12px;border:1px solid rgba(255,255,255,.3);border-radius:6px;font-size:14px;font-weight:500;background:rgba(255,255,255,.15);color:var(--text);display:none;" onchange="CW._onWO()"><option value="">腰型手动选</option><option value="中低腰">中低腰</option><option value="中高腰">中高腰</option><option value="高腰">高腰</option><option value="低腰">低腰</option></select>'+
'<button class="btn btn-outline btn-sm" id="cwWCfgBtn" onclick="CW._toggleWaistCfg()" style="margin-left:4px;padding:3px 8px;font-size:11px;" title="腰型范围配置">⚙</button></div>'+
'<div id="cwWCfgPanel" class="hidden" style="margin-top:6px;padding:10px 14px;background:rgba(255,255,255,.1);border-radius:8px;border:1px solid rgba(255,255,255,.2);"></div>'+
'</div></div></div>'+
'<div style="font-size:13px;font-weight:600;color:var(--text);margin-top:12px;">🏷️ 补充卖点标签</div>'+
'<div class="cw-tags-wrap" id="cwTagsWrap"><input class="cw-tag-input" id="cwTagInput" placeholder="输入卖点后回车..." maxlength="20"></div>'+
'<div class="cw-generate-row" style="margin-top:14px;">'+
'<button class="btn btn-primary" id="cwGen" style="padding:12px 32px;font-size:15px;font-weight:600;" disabled>🚀 生成文案</button>'+
'<span style="font-size:12px;color:var(--text2);">版本数</span><select id="cwVC" style="padding:4px 6px;border:1px solid rgba(255,255,255,.25);border-radius:6px;font-size:12px;background:rgba(255,255,255,.1);color:var(--text);"><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option><option value="4">4</option><option value="5">5</option></select>'+
'<span style="font-size:12px;color:var(--text2);">模型</span><select id="cwModel" style="padding:4px 6px;border:1px solid rgba(255,255,255,.25);border-radius:6px;font-size:12px;background:rgba(255,255,255,.1);color:var(--text);"><option value="qwen3-vl-flash" selected>Qwen3-VL Flash</option><option value="qwen3-vl-plus">Qwen3-VL Plus</option><option value="qwen3.6-plus">Qwen3.6 Plus</option></select></div></div>'+
'<div class="card hidden" id="cwResult"><div class="card-title"><span class="icon">✍️</span>文案生成结果<span style="font-size:12px;color:var(--text2);font-weight:400;" id="cwRSt"></span><span style="flex:1;"></span><button class="btn btn-outline btn-sm hidden" id="cwReGen" onclick="CW.regenerate()">🔄 重新生成</button><button class="btn btn-outline btn-sm hidden" id="cwCopyAll" onclick="CW.copyAll()">📋 复制全部</button></div><div id="cwGrid"></div><div class="cw-stream-raw hidden" id="cwRaw"></div></div>'+
'<div class="card hidden" id="cwHistory"><div class="card-title"><span class="icon">📜</span>历史记录<button class="btn btn-outline btn-sm" onclick="CW._clearHistory()" style="margin-left:12px;font-size:10px;">清空</button></div><div id="cwHistoryList" style="max-height:500px;overflow-y:auto;"></div></div>';
    this._bindSlots();
    this._loadHistory();
  },

  _slot(i) { var hint=i===0?'拖拽/粘贴/点击上传裤子图片':'补充图'; return '<div class="cw-image-slot'+(i===1?' cw-image-slot-sm':'')+'" id="cwSlot'+i+'" data-slot="'+i+'"><div class="slot-label"><span class="icon">'+(i===0?'📷':'🔍')+'</span>'+hint+'</div><button class="clear-slot" data-slot="'+i+'">&times;</button><input type="file" accept="image/*" id="cwSlotIn'+i+'" style="display:none;"></div>'; },

  _bindEvents() {
    var g = document.getElementById('cwGen'); if (g) g.addEventListener('click', function(){ CW.generate(); });
    var v = document.getElementById('cwVC'); if (v) v.addEventListener('change', function(){ CW.versionCount = parseInt(v.value); });
    var m = document.getElementById('cwModel'); if (m) m.addEventListener('change', function(){ CW.currentModel = m.value; });
    var t = document.getElementById('cwTagInput'); if (t) t.addEventListener('keydown', function(e){ if (e.key==='Enter'){ e.preventDefault(); CW._addTag(t.value.trim()); t.value=''; }});
    // Ctrl+V 粘贴图片到素材槽位
    document.addEventListener('paste', function(e) {
      if (CW.isGenerating) return;
      var cwContainer = document.getElementById('copywriterContainer');
      if (!cwContainer || cwContainer.classList.contains('hidden')) return;
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image/') === 0) {
          e.preventDefault();
          // 主槽空 → 填入主槽；主槽已有 → 填入尺码表
          if (!CW.productImages[0]) {
            CW._handleFile(0, items[i].getAsFile());
          } else {
            if (CW.sizeDataSource !== 'upload') CW._onSizeTab('upload');
            CW._handleSizeFile(items[i].getAsFile());
          }
          return;
        }
      }
    });
  },

  _bindSlots() {
    for (var i=0;i<2;i++) (function(idx){
      var s=document.getElementById('cwSlot'+idx), inp=document.getElementById('cwSlotIn'+idx);
      if(s&&inp){ s.addEventListener('click',function(e){ if(!e.target.classList.contains('clear-slot'))inp.click(); });
        inp.addEventListener('change',function(e){ if(e.target.files[0])CW._handleFile(idx,e.target.files[0]); });
        s.addEventListener('dragover',function(e){ e.preventDefault(); });
        s.addEventListener('drop',function(e){ e.preventDefault(); if(e.dataTransfer.files[0])CW._handleFile(idx,e.dataTransfer.files[0]); });
        s.querySelector('.clear-slot').addEventListener('click',function(e){ e.stopPropagation();CW._clearSlot(idx); }); }
    })(i);
    var sz=document.getElementById('cwSizeUp'), sf=document.getElementById('cwSizeFile');
    if(sz&&sf){ sz.addEventListener('click',function(){ sf.click(); });
      sf.addEventListener('change',function(e){ if(e.target.files[0])CW._handleSizeFile(e.target.files[0]); });
      sz.addEventListener('dragover',function(e){ e.preventDefault(); });
      sz.addEventListener('drop',function(e){ e.preventDefault(); if(e.dataTransfer.files[0])CW._handleSizeFile(e.dataTransfer.files[0]); }); }
  },

  // ======== Image ========
  _handleFile(idx,file){ var r=new FileReader(); r.onload=function(){ CW.productImages[idx]=r.result; CW._renderSlot(idx); CW._upGen(); }; r.readAsDataURL(file); },
  _clearSlot(idx){ delete this.productImages[idx]; this._renderSlot(idx); this._upGen(); var inp=document.getElementById('cwSlotIn'+idx); if(inp)inp.value=''; },
  _renderSlot(idx){ var s=document.getElementById('cwSlot'+idx); if(!s)return; var img=this.productImages[idx]; if(img){ s.classList.add('has-image'); var lbl=s.querySelector('.slot-label'); if(lbl)lbl.style.display='none'; var el=s.querySelector('img'); if(!el){ el=document.createElement('img'); s.insertBefore(el,s.firstChild); } el.src=img; } else { s.classList.remove('has-image'); var el=s.querySelector('img'); if(el)el.remove(); var lbl=s.querySelector('.slot-label'); if(lbl)lbl.style.display=''; } },
  _renderAllSlots(){ for(var i=0;i<2;i++)this._renderSlot(i); },

  _handleSizeFile(file){ var r=new FileReader(); r.onload=function(){ CW._runOCR(r.result); }; r.readAsDataURL(file); },

  async _runOCR(b64){
    var st=document.getElementById('cwSizeSt'), orbit=document.getElementById('cwOrbit'), up=document.getElementById('cwSizeUp');
    if(st)st.textContent='正在识别尺码表...'; if(up)up.classList.add('hidden'); if(orbit)orbit.classList.remove('hidden');
    try {
      var map=typeof mappings!=='undefined'?mappings:{}, m=typeof currentModel!=='undefined'?currentModel:'qwen3-vl-flash';
      var r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:b64,mappings:map,model:m})});
      var d=await r.json();
      if(d.success){ this.sizeData=d.data; if(d.raw)this._rawOcrText=d.raw; this._updateSS(); this._detectWaist(); this._upGen(); if(typeof toast==='function')toast('尺码表识别成功','success'); }
      else { if(st)st.textContent='识别失败: '+(d.error||'未知'); if(typeof toast==='function')toast('识别失败: '+d.error,'error'); }
    } catch(e){ if(st)st.textContent='请求失败: '+e.message; }
    if(orbit)orbit.classList.add('hidden'); if(up)up.classList.remove('hidden');
  },

  // ======== Size source ========
  _onSizeTab(src){ this.sizeDataSource=src;
    var u=document.getElementById('cwSizeUp'), s=document.getElementById('cwSizeSt');
    var te=document.getElementById('cwTabExist'), tu=document.getElementById('cwTabUpload');
    if(te&&tu){ te.classList.toggle('active',src==='existing'); tu.classList.toggle('active',src==='upload'); }
    if(src==='upload'){ if(u)u.classList.remove('hidden'); if(s)s.textContent='请上传尺码表图片'; this.sizeData=null; this._rawOcrText=null; }
    else { if(u)u.classList.add('hidden'); if(typeof resultData!=='undefined'&&resultData){ this.sizeData=resultData; this._tryReadRaw(); } this._updateSS(); this._detectWaist(); }
    this._upGen(); },
  _onSS(){ this._onSizeTab(this.sizeDataSource); },
  _updateSS(){ var s=document.getElementById('cwSizeSt'); if(!s)return; if(!this.sizeData||!this.sizeData.headers){ s.textContent='暂无尺码数据'; s.style.color='var(--text2)'; } },
  _updateSizeSourceUI(){ this._updateSS(); this._detectWaist(); this._upGen(); },
  _upGen(){ var b=document.getElementById('cwGen'); if(!b)return; b.disabled=!this.productImages[0]||!this.sizeData||!this.sizeData.headers||this.isGenerating; },

  // ======== Waist detection from raw OCR ========
  _detectWaist(){
    var raw=this._rawOcrText;
    if(raw&&raw!=='(无)')console.log('[CW] RAW:',raw);
    // 优先从 sizeData 的 headers/rows 查找前浪（结构化数据更可靠）
    var sd=this.sizeData;
    if(sd&&sd.headers&&sd.rows&&sd.rows.length>0){
      var fronts=['前浪','裆深','上裆','直裆','前裆','股上','上浪','前浪连腰'], fi=-1;
      for(var i=0;i<sd.headers.length;i++){ var h=(sd.headers[i]||'').replace(/ /g,''); for(var j=0;j<fronts.length;j++){ if(h.indexOf(fronts[j])!==-1){ fi=i; break; } } if(fi!==-1)break; }
      if(fi!==-1){
        var v=parseFloat(String(sd.rows[0][fi]||'').replace(/cm|CM/ig,'').trim());
        if(!isNaN(v)&&v>0){
          var wt=CW._classify(v);
          this.waistInfo={waist_type:wt||'未知',front_rise:v,note:wt?('尺寸表检测 '+v+'cm'):('值'+v+'cm不在判定范围')};
          this._updateWaistStatus(); this._renderWaist(); return;
        }
      }
    }
    // fallback: 从 raw text 解析
    if(raw&&raw!=='(无)'){
      var map=this._parseFront(raw);
      if(map&&map.length>0){
        var first=map[0], wt=CW._classify(first.front_rise);
        this._selWaistIdx=0;
        this.waistInfo={waist_type:wt||'未知',front_rise:first.front_rise,note:wt?('尺码'+first.size+',raw检测'):('值'+first.front_rise+'cm不在22-28cm')};
        if(!wt&&typeof toast==='function')toast('前浪'+first.front_rise+'cm不在判定范围,请手动选腰型','info');
        this._updateWaistStatus(); this._renderWaist(); return;
      }
    }
    // 都失败了
    if(!raw||raw==='(无)'){ this.waistInfo={waist_type:'未知',front_rise:null,note:'暂无OCR数据'}; }
    else { this.waistInfo={waist_type:'未知',front_rise:null,note:'raw中未找到前浪字段'}; }
    this._updateWaistStatus(); this._renderWaist();
  },

  _parseFront(raw){
    if(!raw||raw==='(无)')return null;
    var lines=raw.split('\n'),sizeCols=[],frontCols=[];
    for(var li=0;li<lines.length;li++){
      var parts=lines[li].split('|'); for(var pi=0;pi<parts.length;pi++)parts[pi]=parts[pi].trim();
      if(parts.length<2)continue;
      var name=parts[0];
      if(name.indexOf('尺码')!==-1){ for(var i=1;i<parts.length;i++)sizeCols.push({idx:i,val:parts[i]}); }
      else { var found=false; for(var ci=0;ci<['浪','裆','股上','前'].length;ci++){ if(name.indexOf(['浪','裆','股上','前'][ci])!==-1){ for(var j=1;j<parts.length;j++)frontCols.push({idx:j,val:parts[j]}); found=true; break; } } }
    }
    if(sizeCols.length===0||frontCols.length===0)return null;
    function cSize(v){ var s=v.replace(/码/g,'').trim(); s=s.replace(/\.0+$/,''); if(/^\d{1,2}$/.test(s)){ var n=parseInt(s,10); return (n>=20&&n<=50)?n:NaN; } if(/^[A-Z]{1,3}$/.test(s))return s.charCodeAt(0); return NaN; }
    function cFront(v){ var s=v.replace(/cm|CM/g,'').trim(); if(!/^\d{1,2}(\.\d{1,2})?$/.test(s))return NaN; var n=parseFloat(s); return (n>=15&&n<=35)?n:NaN; }
    var pairs=[];
    for(var i=0;i<sizeCols.length;i++){ var sv=cSize(sizeCols[i].val); if(isNaN(sv))continue; var fv=NaN; for(var j=0;j<frontCols.length;j++){ if(frontCols[j].idx===sizeCols[i].idx){ fv=cFront(frontCols[j].val); break; } } if(!isNaN(fv))pairs.push({size:sizeCols[i].val.replace(/码/g,'').trim().replace(/\.0+$/,''),front_rise:fv}); }
    return pairs.length>0?pairs:null;
  },

  _classify(cm){ var r=this.waistRules||CW._defaultWaistRules(); for(var i=0;i<r.length;i++){ if(cm>=r[i].lo&&cm<=r[i].hi)return r[i].label; } return null; },
  _defaultWaistRules(){ return [{lo:0,hi:21.99,label:'低腰'},{lo:22,hi:24,label:'中低腰'},{lo:25,hi:28,label:'中高腰'},{lo:28.01,hi:99,label:'高腰'}]; },

  _updateWaistStatus(){ var s=document.getElementById('cwSizeSt'); if(!s)return; var wt=(this.waistInfo&&this.waistInfo.waist_type)||'未知'; var fr=this.waistInfo?this.waistInfo.front_rise:null; if(wt!=='未知'&&fr){ s.textContent='✅ 前浪连腰 '+fr+'cm → '+wt; s.style.color='var(--success)'; } else if(this.waistInfo&&this.waistInfo.note){ s.textContent='⚠ '+this.waistInfo.note; s.style.color='#e8a838'; } else { s.textContent='暂无腰型数据'; s.style.color='var(--text2)'; } },

  _renderWaist(){
    var b=document.getElementById('cwWB'), d=document.getElementById('cwWD'), o=document.getElementById('cWOverride'), s=document.getElementById('cwWSize'), cfg=document.getElementById('cwWCfgBtn');
    if(!b||!d)return; if(cfg)cfg.style.display='';
    var wt=(this.waistInfo&&this.waistInfo.waist_type)||'未知', fr=this.waistInfo?this.waistInfo.front_rise:null;
    b.textContent=wt; b.className='cw-waist-badge '+(wt==='中低腰'||wt==='低腰'?'low-mid':wt==='中高腰'||wt==='高腰'?'mid-high':'unknown');
    d.textContent=(fr!==null&&fr!==undefined)?'（前浪 '+fr+'cm）':(this.waistInfo?(this.waistInfo.note||''):'');
    // 手动选腰型始终可见
    if(o)o.style.display='';
    // 码数选择器：有raw数据时显示
    if(s&&this._rawOcrText){ var map=this._parseFront(this._rawOcrText); if(map&&map.length>0){ s.style.display=''; s.innerHTML=map.map(function(m,i){ return '<option value="'+i+'"'+(i===CW._selWaistIdx?' selected':'')+'>'+m.size+'码（前浪'+m.front_rise+'cm）</option>'; }).join(''); } else s.style.display='none'; } else if(s)s.style.display='none';
  },

  _onWSize(){ var sel=document.getElementById('cwWSize'); if(!sel)return; var idx=parseInt(sel.value); if(isNaN(idx))return; this._selWaistIdx=idx; var map=this._parseFront(this._rawOcrText); if(!map||idx>=map.length)return; var m=map[idx], wt=CW._classify(m.front_rise); this.waistInfo={waist_type:wt||'未知',front_rise:m.front_rise,note:wt?('尺码'+m.size):('值'+m.front_rise+'cm不在22-28cm')}; this._renderWaist(); },
  _onWO(){ var sel=document.getElementById('cWOverride'); if(!sel)return; if(sel.value){ if(!this.waistInfo)this.waistInfo={}; this.waistInfo.waist_type=sel.value; this.waistInfo.note='(手动指定)'; if(!this.sizeData||!this.sizeData.headers)this.sizeData={headers:[],rows:[]}; this._renderWaist(); this._upGen(); } },

  _toggleWaistCfg(){ var p=document.getElementById('cwWCfgPanel'); if(!p)return; p.classList.toggle('hidden'); if(!p.classList.contains('hidden'))this._renderWaistCfg(); },
  _renderWaistCfg(){ var p=document.getElementById('cwWCfgPanel'); if(!p)return; var rules=this.waistRules||this._defaultWaistRules(); p.innerHTML='<div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px;">腰型范围配置</div>'+rules.map(function(r,i){ return '<div style="display:flex;align-items:center;gap:6px;margin:4px 0;font-size:12px;"><input value="'+r.lo+'" data-idx="'+i+'" data-fi="lo" style="width:50px;padding:2px 4px;border:1px solid rgba(255,255,255,.25);border-radius:4px;font-size:12px;text-align:center;background:rgba(255,255,255,.1);color:var(--text);"><span style="color:var(--text2);">~</span><input value="'+r.hi+'" data-idx="'+i+'" data-fi="hi" style="width:50px;padding:2px 4px;border:1px solid rgba(255,255,255,.25);border-radius:4px;font-size:12px;text-align:center;background:rgba(255,255,255,.1);color:var(--text);"><span style="flex:1;color:var(--text);">'+CW._esc(r.label)+'</span></div>'; }).join('')+'<button class="btn btn-outline btn-sm" onclick="CW._applyWaistCfg()" style="margin-top:6px;">应用</button>'; },
  _applyWaistCfg(){ var p=document.getElementById('cwWCfgPanel'); if(!p)return; var rules=this.waistRules||this._defaultWaistRules(); p.querySelectorAll('input').forEach(function(inp){ var i=parseInt(inp.dataset.idx), fi=inp.dataset.fi; if(i>=0&&i<rules.length)rules[i][fi]=parseFloat(inp.value)||rules[i][fi]; }); this.waistRules=rules; this._detectWaist(); if(typeof toast==='function')toast('腰型配置已更新','success'); },

  // ======== Tags ========
  _addTag(tag){ if(!tag||this.manualTags.indexOf(tag)!==-1)return; this.manualTags.push(tag); this._renderTags(); },
  _removeTag(tag){ this.manualTags=this.manualTags.filter(function(t){ return t!==tag; }); this._renderTags(); },
  _renderTags(){ var wrap=document.getElementById('cwTagsWrap'), inp=document.getElementById('cwTagInput'); if(!wrap)return; var tags=wrap.querySelectorAll('.cw-tag'); for(var i=0;i<tags.length;i++)tags[i].remove(); for(var i=0;i<this.manualTags.length;i++)(function(tag){ var sp=document.createElement('span'); sp.className='cw-tag'; sp.innerHTML=CW._esc(tag)+'<span class="remove-tag">&times;</span>'; sp.querySelector('.remove-tag').addEventListener('click',function(){ CW._removeTag(tag); }); wrap.insertBefore(sp,inp); })(this.manualTags[i]); },

  // ======== Generate (SSE streaming) ========
  async generate(){
    if(this.isGenerating)return;
    if(!this.productImages[0]){ if(typeof toast==='function')toast('请先上传裤子图片','error'); return; }
    if(!this.sizeData){ if(typeof toast==='function')toast('请先提供尺码数据','error'); return; }
    this.isGenerating=true; this._upGen(); this._lastError='';

    var res=document.getElementById('cwResult'), grid=document.getElementById('cwGrid'),
        rawDiv=document.getElementById('cwRaw'), st=document.getElementById('cwRSt'),
        reGen=document.getElementById('cwReGen'), copyAll=document.getElementById('cwCopyAll');
    if(res){ res.classList.remove('hidden'); setTimeout(function(){ res.scrollIntoView({behavior:'smooth'}); }, 100); } if(rawDiv){ rawDiv.classList.remove('hidden'); rawDiv.textContent=''; }
    if(st)st.textContent='正在生成...'; if(reGen)reGen.classList.add('hidden'); if(copyAll)copyAll.classList.add('hidden');

    // 等待期 loading 动画
    if(grid) grid.innerHTML='<div style="text-align:center;padding:48px 0;">'+
      '<div id="cwWaitSpin" style="display:inline-block;width:48px;height:48px;border:3px solid rgba(255,255,255,.2);border-top-color:var(--primary);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:16px;"></div>'+
      '<div id="cwWaitText" style="font-size:14px;color:var(--text2);">AI 正在分析裤子图片...</div></div>'+
      '<div class="cw-results-two-col hidden" id="cwStreamWrap">'+
      '<div class="cw-results-col-left"><div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px;">🏷️ 卖点文案</div><div id="cwSub2"></div></div>'+
      '<div class="cw-results-col-right"><div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px;">📝 详情页文案</div><div id="cwSub1"></div></div></div>';
    for(var t=1;t<=2;t++){ var sg=document.getElementById('cwSub'+t); if(sg)for(var i=1;i<=3;i++)sg.innerHTML+='<div class="cw-version-card streaming" style="min-width:0;margin-bottom:12px;"><div class="best-badge">✅ 推荐</div><div class="cw-version-label">版本 '+i+'</div><div class="cw-stream-content" style="font-size:13px;color:var(--text2);white-space:pre-wrap;font-family:monospace;opacity:.5;"></div></div>'; }
    var streamWrap=document.getElementById('cwStreamWrap'), waitSpin=document.getElementById('cwWaitSpin'), waitText=document.getElementById('cwWaitText');
    var firstToken=true;

    var images=[]; for(var k in this.productImages){ if(this.productImages[k])images.push(this.productImages[k]); }
    var wo=document.getElementById('cWOverride'), waistOv=wo?wo.value:'';

    try {
      var r=await fetch('/api/copywriter/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_images:images,size_data:this.sizeData,waist_type_override:waistOv,model:this.currentModel,manual_tags:this.manualTags,count:3})});
      if(!r.ok)throw new Error('HTTP '+r.status);
      var reader=r.body.getReader(), decoder=new TextDecoder(), fullText='', buf='';
      while(true){
        var chunk=await reader.read(); if(chunk.done)break;
        buf+=decoder.decode(chunk.value,{stream:true});
        var parts=buf.split('\n'); buf=parts.pop()||'';
        for(var li=0;li<parts.length;li++){
          var line=parts[li].trim(); if(line.indexOf('data: ')!==0)continue;
          var payload=line.slice(6); if(payload==='[DONE]')continue;
          try { var p=JSON.parse(payload);
            if(p.error){ this._lastError=p.error; if(typeof toast==='function')toast('生成失败: '+p.error,'error'); }
            if(p.token){
              if(firstToken){ firstToken=false; if(waitSpin)waitSpin.remove(); if(waitText)waitText.textContent='正在生成文案...'; if(streamWrap)streamWrap.classList.remove('hidden'); if(st)st.textContent='流式输出中...'; }
              fullText+=p.token;
            }
            if(p.copies){ this.generatedCopies=p.copies; this._compliance=p.compliance||[]; }
          } catch(e){}
        }
        if(fullText&&grid){
          var cards=document.querySelectorAll('#cwGrid .cw-stream-content');
          var n=cards.length, cs=Math.ceil(fullText.length/Math.max(1,n));
          cards.forEach(function(el,i){ el.textContent=fullText.slice(i*cs,(i+1)*cs); });
        }
      }
    } catch(e){ this._lastError=e.message; if(typeof toast==='function')toast('请求失败: '+e.message,'error'); }

    this.isGenerating=false; this._upGen();
    if(reGen)reGen.classList.remove('hidden'); if(copyAll)copyAll.classList.remove('hidden');
    if(rawDiv)rawDiv.classList.add('hidden'); if(st)st.textContent='';
    if(this.generatedCopies&&this.generatedCopies.length>0){
      var cards=document.querySelectorAll('#cwGrid .cw-version-card.streaming');
      // 1. 去除 6s 渐入动画，瞬间跳到当前 opacity
      cards.forEach(function(c){ c.classList.add('stream-done'); });
      // 2. 0.3s 内降到 0.3
      setTimeout(function(){ cards.forEach(function(c){ c.classList.add('fade-down'); }); }, 50);
      // 3. 0.8s 内亮起
      setTimeout(function(){ cards.forEach(function(c){ c.classList.add('brighten'); }); }, 350);
      // 4. 切换为结构化结果
      setTimeout(function(){ CW._renderResults(); }, 1200);
      this._addToHistory();
    }
    else if(grid)grid.innerHTML='<div style="text-align:center;padding:40px;color:var(--danger);">生成失败'+(this._lastError?': '+CW._esc(this._lastError):'')+'<br><small style="color:var(--text2);">API Key/额度/超时</small></div>';
  },
  async regenerate(){ this.generatedCopies=null; await this.generate(); },

  // ======== Results rendering (two-column) ========
  _renderResults(){
    var grid=document.getElementById('cwGrid'); if(!grid)return;
    var copies=this.generatedCopies; if(!copies||copies.length===0){ grid.innerHTML='<div style="text-align:center;padding:40px;color:var(--text2);">无结果</div>'; return; }
    var types={}; for(var i=0;i<copies.length;i++){ var t=copies[i].type||1; if(!types[t])types[t]=[]; types[t].push(copies[i]); }
    var left=types[2]||[], right=types[1]||[];
    grid.innerHTML='<div class="cw-results-two-col"><div class="cw-results-col-left"><div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px;">🏷️ 卖点文案</div>'+_bCol(2,left)+'</div><div class="cw-results-col-right"><div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px;">📝 详情页文案</div>'+_bCol(1,right)+'</div></div>';
    function _bCol(type,group){
      if(group.length===0)return '<div style="color:var(--text2);font-size:12px;padding:20px;">无</div>';
      var bestV=null; for(var j=0;j<group.length;j++){ if(group[j].best){ bestV=group[j].version; break; } }
      var h=''; for(var j=0;j<group.length;j++){
        var c=group[j], isBest=c.version===bestV, tc='';
        if(type===1){ tc='<div class="cw-section-a"><div class="cw-title">'+CW._esc(c.title_a||'')+'</div><div class="cw-body">'+CW._esc(c.body_a||'')+'</div></div>'; }
        else { var par='颜色：'+(c.color||'')+' 面料成分： 弹力指数： 版型类型： 厚度指数：'+(c.thickness||'适中')+' 柔软指数：'+(c.softness||'适中'); var its=''; for(var k=0;k<(c.items||[]).length;k++)its+='<div style="margin-bottom:10px;"><b style="color:var(--text);font-size:13px;">'+CW._esc(c.items[k].title||'')+'</b><div style="font-size:13px;color:var(--text);line-height:1.6;margin-top:2px;">'+CW._esc(c.items[k].desc||'')+'</div></div>'; tc='<div class="cw-section-b"><div style="font-size:11px;color:var(--text2);margin-bottom:10px;line-height:1.8;">'+CW._esc(par)+'</div>'+its+'</div>'; }
        h+='<div class="cw-version-card'+(isBest?' best':' dimmed')+'" style="min-width:0;margin-bottom:12px;">'+(isBest?'<div class="best-badge">✅ 推荐</div>':'')+'<div class="cw-version-label">版本 '+c.version+'</div>'+tc+'<div class="cw-card-actions"><button class="btn btn-outline btn-sm" onclick="CW._copyVer('+c.version+','+type+')">📋 复制</button><button class="btn btn-outline btn-sm" onclick="CW._editCopy('+c.version+','+type+')">✏️ 编辑后复制</button></div></div>';
      }
      return h;
    }
    var rc=document.getElementById('cwResult'); if(rc)rc.scrollIntoView({behavior:'smooth'});
    var hc=document.getElementById('cwHistory'); if(hc)hc.classList.remove('hidden');
    if(typeof toast==='function')toast('文案生成完成！','success');
    this._addToHistory();
  },

  _copyVer(v,type){
    var c=(this.generatedCopies||[]).find(function(x){ return x.version===v&&x.type===type; }); if(!c)return;
    var t; if(type===1){ t='标题：'+(c.title_a||'')+'\n\n详情：'+(c.body_a||''); } else { t='颜色：'+(c.color||'')+'\n厚度指数：'+(c.thickness||'适中')+'\n柔软指数：'+(c.softness||'适中')+'\n\n'; for(var k=0;k<(c.items||[]).length;k++)t+=c.items[k].title+'：'+c.items[k].desc+'\n\n'; }
    navigator.clipboard.writeText(t).then(function(){ if(typeof toast==='function')toast('已复制版本'+v,'success'); });
  },
  _editCopy(v,type){
    var c=(this.generatedCopies||[]).find(function(x){ return x.version===v&&x.type===type; }); if(!c)return;
    var t; if(type===1){ t='标题：'+(c.title_a||'')+'\n\n详情：'+(c.body_a||''); } else { t='颜色：'+(c.color||'')+'\n厚度指数：'+(c.thickness||'适中')+'\n柔软指数：'+(c.softness||'适中')+'\n\n'; for(var k=0;k<(c.items||[]).length;k++)t+=c.items[k].title+'：'+c.items[k].desc+'\n\n'; }
    var ta=document.createElement('textarea'); ta.value=t;
    ta.style.cssText='position:fixed;top:8%;left:15%;width:70%;height:70%;z-index:99999;padding:24px;font-size:14px;border:2px solid var(--primary);border-radius:12px;background:rgba(255,255,255,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);color:var(--text);box-shadow:0 12px 40px rgba(0,0,0,.2);';
    document.body.appendChild(ta); ta.focus(); ta.select();
    ta.addEventListener('blur',function(){ navigator.clipboard.writeText(ta.value).then(function(){ if(typeof toast==='function')toast('编辑后已复制','success'); }); ta.remove(); });
  },
  copyAll(){ if(!this.generatedCopies)return; var all=this.generatedCopies.map(function(c){ var t; if(c.type===1){ t='=== 详情页 版本'+c.version+' ===\n标题: '+(c.title_a||'')+'\n详情: '+(c.body_a||''); } else { t='=== 卖点 版本'+c.version+' ===\n颜色: '+(c.color||'')+'\n'; for(var k=0;k<(c.items||[]).length;k++)t+=c.items[k].title+': '+c.items[k].desc+'\n'; } return t; }).join('\n\n---\n\n'); navigator.clipboard.writeText(all).then(function(){ if(typeof toast==='function')toast('已复制全部','success'); }); },

  _esc: function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); },

  // ======== History ========
  _HIST_KEY: 'sizeflow_cw_history',
  _history: [],

  _loadHistory(){ try { var s=localStorage.getItem(this._HIST_KEY); if(s)this._history=JSON.parse(s); if(!Array.isArray(this._history))this._history=[]; } catch(e){ this._history=[]; } this._renderHistory(); },
  _saveHistory(){ try { if(this._history.length>50)this._history=this._history.slice(0,50); localStorage.setItem(this._HIST_KEY,JSON.stringify(this._history)); } catch(e){} this._renderHistory(); },
  _addToHistory(){
    if(!this.generatedCopies||this.generatedCopies.length===0)return;
    var self=this;
    var id='cw_'+Date.now()+'_'+Math.random().toString(36).substr(2,6);
    var imgRefs=[];
    var saveImages=[]; for(var k in this.productImages){ if(this.productImages[k]){ var rid=id+'_'+k; imgRefs.push({slot:k,ref:rid}); saveImages.push(IDB.put(rid,this.productImages[k])); } }
    Promise.all(saveImages).then(function(){
      var entry={id:id, time:new Date().toISOString(), copies:JSON.parse(JSON.stringify(self.generatedCopies)), waist:self.waistInfo?JSON.parse(JSON.stringify(self.waistInfo)):null, model:self.currentModel, tags:JSON.parse(JSON.stringify(self.manualTags)), versionCount:self.versionCount, sizeData:self.sizeData?JSON.parse(JSON.stringify(self.sizeData)):null, imgRefs:imgRefs };
      self._history.unshift(entry); if(self._history.length>50){ var old=self._history.slice(50); self._history.length=50; old.forEach(function(o){ if(o.imgRefs)IDB.delMany(o.imgRefs.map(function(r){return r.ref;})); }); }
      self._saveHistory();
    }).catch(function(e){ console.error('Save session failed:',e); });
  },
  _renderHistory(){
    var list=document.getElementById('cwHistoryList'); if(!list)return;
    if(this._history.length===0){ list.innerHTML='<div style="color:var(--text2);font-size:12px;padding:12px;">暂无历史会话</div>'; return; }
    list.innerHTML=this._history.map(function(h,i){
      var ts=h.time?new Date(h.time):null, timeStr=ts?CW._fmtTime(ts):'';
      var preview=''; try { var c=h.copies[0]; preview=(c.title_a||(c.items&&c.items[0]?c.items[0].title:'')); } catch(e){}
      var waist=h.waist&&h.waist.waist_type?h.waist.waist_type:'';
      var imgCount=h.imgRefs?h.imgRefs.length:0;
      return '<div class="cw-history-item" style="padding:10px 14px;margin:4px 0;border-radius:10px;background:rgba(255,255,255,.08);cursor:pointer;transition:all .2s;position:relative;" onclick="CW._viewHistory('+i+')" onmouseover="this.style.background=\'rgba(255,255,255,.15)\'" onmouseout="this.style.background=\'rgba(255,255,255,.08)\'">'+
        '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--text2);">'+timeStr+'</span>'+(waist?'<span style="font-size:10px;color:var(--primary);background:rgba(79,110,246,.1);padding:1px 6px;border-radius:4px;">'+CW._esc(waist)+'</span>':'')+(imgCount?'<span style="font-size:10px;color:var(--success);background:rgba(46,168,122,.12);padding:1px 6px;border-radius:4px;">📷'+imgCount+'</span>':'')+'<span style="font-size:10px;color:var(--text2);">'+CW._esc(h.model||'')+'</span><span style="flex:1;"></span><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();CW._deleteHistoryEntry('+i+');" style="padding:1px 6px;font-size:10px;" title="删除此会话">🗑</button></div>'+
        '<div style="font-size:13px;color:var(--text);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+CW._esc(preview||'(无标题)')+'</div></div>';
    }).join('')+'<div style="font-size:11px;color:var(--text2);text-align:center;padding:8px;">共 '+this._history.length+' 条会话（最多50条）</div>';
  },
  _deleteHistoryEntry(idx){
    var h=this._history[idx]; if(!h)return;
    if(h.imgRefs&&h.imgRefs.length>0) IDB.delMany(h.imgRefs.map(function(r){return r.ref;}));
    this._history.splice(idx,1); this._saveHistory();
    if(typeof toast==='function')toast('会话已删除','info');
  },
  _viewHistory(idx){
    var h=this._history[idx]; if(!h)return;
    var self=this;
    this.generatedCopies=h.copies; this._compliance=[];
    if(h.sizeData){ this.sizeData=h.sizeData; this._updateSS(); this._upGen(); }
    if(h.waist){ this.waistInfo=h.waist; this._renderWaist(); }
    if(h.tags){ this.manualTags=h.tags; this._renderTags(); }
    if(h.versionCount){ this.versionCount=h.versionCount; var vc=document.getElementById('cwVC'); if(vc)vc.value=h.versionCount; }
    if(h.model){ this.currentModel=h.model; var m=document.getElementById('cwModel'); if(m)m.value=h.model; }
    if(h.imgRefs&&h.imgRefs.length>0){
      h.imgRefs.forEach(function(r){
        IDB.get(r.ref).then(function(b64){ if(b64){ self.productImages[r.slot]=b64; self._renderSlot(parseInt(r.slot)); self._upGen(); } });
      });
    }
    var wo=document.getElementById('cWOverride'); if(wo&&h.waist&&h.waist.note==='(手动指定)')wo.value=h.waist.waist_type;
    var card=document.getElementById('cwHistory'); if(card)card.classList.add('hidden');
    var res=document.getElementById('cwResult'); if(res)res.classList.remove('hidden');
    this._renderResults();
    setTimeout(function(){ var rc=document.getElementById('cwResult'); if(rc)rc.scrollIntoView({behavior:'smooth'}); },100);
  },
  _clearHistory(){ var self=this; if(confirm('确定清空全部历史会话？图片数据也将删除。')){
    var allRefs=[]; self._history.forEach(function(h){ if(h.imgRefs)h.imgRefs.forEach(function(r){allRefs.push(r.ref);}); });
    self._history=[]; try { localStorage.removeItem(self._HIST_KEY); } catch(e){}
    self._renderHistory();
    if(allRefs.length>0) IDB.delMany(allRefs);
  } },
  _fmtTime(d){ var n=new Date(); var diff=n-d; var m=Math.floor(diff/60000); if(m<1)return '刚刚'; if(m<60)return m+'分钟前'; var h=Math.floor(m/60); if(h<24)return h+'小时前'; var days=Math.floor(h/24); if(days<7)return days+'天前'; return d.toLocaleDateString(); }
};
CW.init();
