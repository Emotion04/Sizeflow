# Sizeflow 项目约定

## 项目文档
- `docs/architecture.md` — 完整架构文档
- `docs/plan-copywriter-module.md` — 文案生成模块开发方案

## 版本号
格式 Canary X.XX，每次 commit message 以 "Canary X.XX: " 开头

## Git
```bash
git -c http.sslVerify=false push origin main
```

## 提交
commit 末尾加 `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`

## 本地服务器
```bash
python server.py    # → localhost:5800
```
修改 `template_service.py` 或 `copywriter.py` 后必须重启 Flask，否则旧代码继续跑。

## 文件结构约定（规范化后）

```
Sizeflow/
├── server.py                  ← Flask 主路由
├── vision.py                  ← AI 视觉调用 (call_qwen, OCR, 解析)
├── stylegen.py                ← AI 样式生成
├── template_service.py        ← 模板引擎 + Playwright
├── copywriter.py              ← 裤子文案生成 (新增)
├── config.py                  ← 配置持久化
├── updater.py                 ← 版本更新检查
├── update_changelog.py        ← changelog 生成
├── templates/
│   └── index.html             ← SPA 主页面 (仅HTML骨架 + 引用)
├── static/
│   ├── css/
│   │   ├── main.css           ← 尺码表工具全部样式
│   │   └── copywriter.css     ← 文案模块样式
│   └── js/
│       ├── sizechart.js       ← 尺码表工具全部 JS (重构自 index.html)
│       ├── copywriter.js      ← 文案模块前端 JS
│       ├── ad-card.js         ← 广告卡片交互
│       └── html2canvas.min.js ← 第三方库
├── font/                      ← PingFangSC 字体
├── docs/                      ← 项目文档
└── Debug/                     ← 调试记录
```

**规则**：
- 新增功能优先放独立文件，不要再往 index.html 堆
- CSS → `static/css/<模块名>.css`
- JS → `static/js/<模块名>.js`，用对象命名空间（如 `CW.xxx`）避免全局冲突
- 后端 → `<模块名>.py`，路由注册在 `server.py`

## 打包 EXE
```bash
pyinstaller --onefile --name Sizeflow --add-data "templates;templates" --add-data "template;template" --add-data "static;static" --add-data "font;font" --add-data "changelog_cache.json;." --hidden-import dashscope --hidden-import playwright --hidden-import bs4 --hidden-import flask --hidden-import dotenv server.py
```

## 更新日志
每次 push 前: `python update_changelog.py`

## 调试原则
- 先对比预览 (iframe) vs 导出 (Playwright) 的 computed style 差异，再动手
- html2canvas 不支持 opacity:0 / flexbox body / backdrop-filter
- 所有 DOM ID 引用前确保元素存在，否则 JS 整段崩溃
- 修改 CSS/JS 外部文件后无需重启 Flask（静态文件由浏览器缓存，硬刷新即可）
