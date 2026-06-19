# Sizeflow 项目架构文档

> 最后更新: 2026-06-16  
> 版本: v1.6.0 → 重构中

---

## 项目定位

服装工厂尺码表转换工具。上传尺码表图片 → AI OCR 识别 → 编辑表格 → 导出 PNG/CSV。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python Flask (端口 5800) |
| AI | 阿里云 DashScope Qwen VL 多模态模型 |
| 前端 | 纯 HTML/CSS/JS 单页应用，液态玻璃设计风格 |
| 模板 | BeautifulSoup 解析 + 动态重建 DOM |
| 渲染 | Playwright Chromium（降级 html2canvas） |
| 部署 | PyInstaller EXE + Vercel Serverless |

## 文件结构

```
Sizeflow/
├── server.py                  ← Flask 主路由 (20+ API 端点)
├── vision.py                  ← AI 视觉调用 + OCR 解析引擎
├── stylegen.py                ← AI 样式生成（文本/参考图）
├── template_service.py        ← 模板引擎 + Playwright PNG 渲染
├── config.py                  ← 配置持久化 (API Key/模型/映射)
├── prompt.py                  ← 旧版 prompt 构建（保留兼容）
├── updater.py                 ← GitHub Releases 版本检查
├── update_changelog.py        ← Git log → changelog_cache.json
├── requirements.txt           ← Python 依赖
├── vercel.json                ← Vercel Serverless 部署配置
├── 启动.bat                   ← Windows 启动脚本
│
├── copywriter.py              ← [新增] 裤子文案生成模块
│
├── templates/
│   └── index.html             ← 主 SPA 页面（Tab导航：尺码表 + 文案生成）
│
├── template/                  ← 导出模板（normal / line / kraft paper）
│   └── .previews/             ← 模板预览 PNG 缓存
│
├── static/
│   ├── css/
│   │   ├── main.css           ← [重构] 尺码表工具全部 CSS
│   │   └── copywriter.css     ← [新增] 文案模块专属样式
│   ├── js/
│   │   ├── html2canvas.min.js ← 客户端截图库（第三方）
│   │   ├── ad-card.js         ← [重构] 广告卡片螃蟹交互
│   │   ├── sizechart.js       ← [重构] 尺码表工具全部 JS
│   │   └── copywriter.js      ← [新增] 文案模块前端逻辑
│   └── wallpapers/            ← 壁纸图片
│
├── font/                      ← PingFangSC 字重文件 (woff2)
├── api/                       ← Vercel serverless 入口
├── docs/                      ← 项目文档
│   ├── architecture.md        ← 本文档
│   └── plan-copywriter-module.md ← 文案模块开发方案
│
├── Debug/                     ← 调试文档
├── changelog_cache.json       ← Git 提交缓存
└── CLAUDE.md                  ← Claude Code 项目约定
```

## 核心数据流

### 尺码表识别（现有）

```
图片上传 → save_base64_image (临时文件)
         → call_ocr_vision (AI 纯转录, pipe-delimited)
         → parse_transcription (服务器解析 + 字段映射 + 模糊匹配)
         → format_numbers (数值格式化)
         → JSON {headers, rows} → 前端渲染可编辑表格
         → fill_template (模板填充) / generate_table_style (AI 样式)
         → render_html_to_png (Playwright) / html2canvas (降级)
```

### 文案生成（新增）

```
裤子图片 + 尺码数据 + [可选]卖点tag
         → /api/copywriter/waist-type (腰型判定)
         → /api/copywriter/generate (SSE 流式)
              ├─ copywriter.py: 构建多模态 messages
              │   system: COPYWRITER_SYSTEM + BANNED_WORDS
              │   user: [图片] + STYLE_GUIDE + STYLE_EXAMPLES + 数据
              ├─ call_qwen(qwen3-vl-plus, stream=True)
              └─ SSE 透传 → 前端 ReadableStream → 3 版本卡片
```

## API 端点汇总

### 尺码表工具
| 端点 | 方法 | 用途 |
|------|------|------|
| `/` | GET | 主页面 |
| `/api/analyze` | POST | AI OCR 识别 |
| `/api/debug-analyze` | POST | 调试模式（预设数据） |
| `/api/key` | GET/POST | API Key 管理 |
| `/api/mappings` | GET/POST | 字段映射管理 |
| `/api/mappings/reset` | POST | 重置默认映射 |
| `/api/model` | GET/POST | 模型选择 |
| `/api/templates` | GET | 模板列表 |
| `/api/template-preview/<id>` | GET | 模板预览图 |
| `/api/apply-template` | POST | 数据填入模板 |
| `/api/render-template-png` | POST | 模板渲染 PNG |
| `/api/render-png` | POST | HTML 渲染 PNG |
| `/api/generate-style` | POST | AI 样式生成 |
| `/api/generate-style-from-image` | POST | 参考图风格生成 |
| `/api/changelog` | GET | 更新日志 |
| `/api/check-update` | GET | 版本检查 |
| `/api/open-download` | POST | 打开下载页 |
| `/api/wallpapers` | GET | 壁纸列表 |
| `/api/bing-wallpaper` | GET | Bing 壁纸代理 |
| `/api/bing-wallpaper-url` | GET | Bing 壁纸 URL |

### 文案生成（新增）
| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/copywriter/generate` | POST | SSE 流式文案生成 |
| `/api/copywriter/waist-type` | POST | 腰型判定 |
| `/api/copywriter/validate` | POST | 合规检查 |

## 关键设计模式

### AI 调用模式
```python
# 多模态（图片+文本）
messages = [
    {"role": "system", "content": "..."},
    {"role": "user", "content": [
        {"image": "file:///path/to/img.jpg"},
        {"text": "prompt text..."},
    ]},
]
result = call_qwen(messages, model="qwen3-vl-plus", temperature=0.0)
```

### API 响应格式
```json
{"success": true, ...}
{"success": false, "error": "错误描述"}
```

### 前端状态管理
全局 JS 变量（`sizechart.js`）+ `localStorage` 持久化关键配置。

### 临时文件管理
`save_base64_image()` 创建 → `finally` 块中 `os.unlink()` 清理。

## 部署方式

1. **源码运行**：`pip install -r requirements.txt && python server.py` → localhost:5800
2. **EXE 分发**：PyInstaller 打包为单文件，双击运行
3. **Vercel**：`api/index.py` 作为 Serverless 入口（部分功能受限）
