# Sizeflow 项目概览

## 这是什么
工厂尺码表图片 → AI 识别 → 可编辑表格 → 套模板导出 PNG 照片。
适合服装行业的尺码表数字化。

## 技术栈
- 后端: Python Flask (server.py)，端口 5800
- 前端: 单页 HTML (templates/index.html)，Vanilla JS
- OCR: 阿里 DashScope 视觉模型
- 渲染: Playwright Chromium（本地） → html2canvas（Vercel 降级）
- 打包: PyInstaller → dist/Sizeflow.exe

## 文件结构
```
Sizeflow/
├── server.py              # Flask 路由 (analyze, render-png, templates, debug)
├── template_service.py    # 模板引擎 + Playwright 渲染
├── vision.py              # OCR 解析 + 字段映射
├── config.py              # 配置持久化
├── updater.py             # EXE 自动更新
├── api/index.py           # Vercel serverless 入口
├── templates/
│   └── index.html         # 前端 SPA (所有 JS/CSS/HTML)
├── template/              # 导出的模板
│   ├── normal.html        # 白底灰表头
│   ├── kraft paper.html   # 牛皮纸风
│   └── line.html          # 十字装饰线
├── font/                  # PingFangSC 字体文件
│   ├── PingFangSC-Medium.woff2        # 默认字重
│   └── PingFangSC/woff2/              # 其他5种字重
├── static/
│   ├── js/html2canvas.min.js          # CDN 本地备份
│   └── wallpapers/
├── Debug/                 # 文档
└── dist/Sizeflow.exe      # 打包输出
```

## 导出 PNG 双路径
| | 路径A（本地） | 路径B（Vercel/EXE） |
|---|---|---|
| 引擎 | Playwright Chromium | html2canvas JS |
| 字体 | 内联 font-weight 匹配 | 依赖 iframe 自然渲染 |
| 截图 | body.screenshot() | html2canvas(body, scale:1) |

## 关键参数
- 背景宽默认 1200px，列多自动撑大
- 留白默认 55px 四边
- 列宽默认 155px，行高默认 72px
- 图片宽 = max(背景宽, 列宽总和 + 2×留白)

## 版本号规则
Canary X.XX 格式，commit message 以 "Canary X.XX: " 开头

## 常用命令
```bash
python server.py                           # 启动
git -c http.sslVerify=false push origin main  # 推送（SSL 被墙）
pyinstaller --onefile --name Sizeflow \
  --add-data "templates;templates" --add-data "template;template" \
  --add-data "static;static" --add-data "font;font" \
  --add-data "changelog_cache.json;." \
  --hidden-import dashscope --hidden-import playwright \
  --hidden-import bs4 --hidden-import flask --hidden-import dotenv \
  server.py                                # 打包 EXE
python update_changelog.py                 # 更新日志缓存
```

## 已知坑
1. **字体**: @font-face 的 font-weight 必须和元素 computed weight 匹配
2. **html2canvas**: 不支持 opacity:0、不支持 flexbox body
3. **cfgTableWidth**: HTML 中不存在的 ID，bindEvents 里引用会导致整个 JS 崩溃
4. **Chrome 残留**: 导出后 Playwright 浏览器没退出干净，后续请求会卡住

## Debug 模式
前端 ⚡Debug 按钮 → /api/debug-analyze → 预设数据直接渲染，不调 AI API。
DEBUG 相关代码用 # DEBUG 注释标记，方便删除。
