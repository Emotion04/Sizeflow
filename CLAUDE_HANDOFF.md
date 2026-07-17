# Claude Handoff — Sizeflow 项目上下文

## 项目概述
**Sizeflow**（工厂尺码表转换工具）— Flask Web 应用，上传服装尺码表图片 → AI OCR 提取表格 → 选模板 → 导出 PNG。

- **当前版本**: v1.9.0
- **Git 分支**: `style-feature`（开发），`main`（Vercel 部署）
- **仓库**: https://github.com/Emotion04/Sizeflow
- **Vercel 部署**: 自动从 `main` 分支部署，域名由用户管理
- **本地运行**: `python server.py` → http://localhost:5800

## 用户信息
- **语言**: 中文沟通
- **用户**: Emotion04，服装行业，需要将工厂尺码表图片转换为标准化表格图片
- **偏好**: 
  - 不要过度设计，保持代码简洁模块化
  - 改动后重启服务器才能看到效果（Flask 无热重载）
  - 频繁用 git push 发布到 Vercel
  - 版本号习惯用 x.y.z 格式（如 1.9.0）

## 核心架构

### 后端（Python Flask）
| 文件 | 用途 |
|------|------|
| `server.py` | Flask 路由入口，所有 API |
| `config.py` | 全局配置：API Key、模型、字段映射、版本号 |
| `vision.py` | DashScope API 调用 + 服务器端解析转录文本 |
| `prompt.py` | OCR 提示词（**当前未被 vision.py 使用**，vision.py 用内联 prompt） |
| `template_service.py` | 模板引擎：`fill_template()` 填数据 + Playwright 渲染 PNG |
| `stylegen.py` | AI 生成 HTML/CSS 样式（未在本次会话中修改） |
| `updater.py` | EXE 自动更新检查（仅 PyInstaller 打包后生效） |
| `api/index.py` | Vercel serverless 入口 |
| `requirements.txt` | flask, dashscope, python-dotenv, playwright, beautifulsoup4 |
| `vercel.json` | Vercel 部署配置（@vercel/python 构建器） |

### 前端（单页面 `templates/index.html`）
- 液态玻璃 UI 风格
- 图片上传（拖拽/粘贴/路径）
- 字段映射面板（可编辑）
- OCR 识别结果表格（可编辑单元格、拖拽重排列、列宽拖拽、行列增删）
- 模板样式选择卡片 + iframe 预览
- **导出列宽/行高控制**：统一滑块 + 逐列/逐行微调面板
- **彩蛋计时器**：识别时疯狂加速的假计时
- PNG 导出双轨制：优先服务端 Playwright → 降级客户端 html2canvas

### 模板文件（`template/` 目录）
| 文件 | 特点 |
|------|------|
| `kraft paper.html` | 牛皮纸风格，棕色表头，`width: auto` |
| `line.html` | 极简风格，CSS 变量驱动的十字线，`width: auto` |
| `normal.html` | 简洁灰白风格，`width: auto` |

## 本次会话关键改动（2026-05-21~22）

### OCR 识别流程（重要！）
- **AI 只做纯转录**：一张图 → 一条 API 调用 → 返回 `部位 | 数值 | 数值` 格式文本
- **服务器做映射**：`vision.py` 的 `parse_transcription()` 100% 确定性字符串匹配
  - `_normalize_name()` 三层模糊匹配：去空格 → 去括号保留内容 → 去括号及内容 → 子串包含
  - 自动检测并切除前导公差列（数据行比尺码行多一列时）
  - 缺失字段填 `/`
  - `format_numbers()` 跳过第一列（尺码），整数去 `.00`
- **字段映射** 在 `config.py:64-72` `DEFAULT_MAPPINGS`：左边是工厂表头名，右边是输出名

### 导出列宽/行高
- 状态变量：`exportColWidth`, `exportColWidths`, `exportRowHeight`, `exportRowHeights`, `exportHeaderHeight`
- `buildExportStylePayload()` → `{colWidths, rowHeights, headerHeight}`
- `fill_template()` 接收这些参数，给 th/td 加 inline `width/height/padding` 样式
- `applyExportColWidths()` / `applyExportRowHeights()` 实时更新 iframe DOM
- **padding 覆盖**：`fill_template` 和 JS 都设 `padding:2px 6px` 覆盖模板 CSS 的 16~20px padding

### PNG 导出双轨制
- 优先 `fetch('/api/render-template-png')` → Playwright 服务端渲染
- 失败则 html2canvas 客户端渲染（Vercel 无 Playwright 浏览器时自动降级）

### 玻璃 UI
- `.card` 背景 `rgba(255,255,255,.1)` + `blur(8px)`
- `.container` 去掉了 `position:relative; z-index:1`（之前阻断 backdrop-filter）
- 默认壁纸改为 Bing 每日（`/api/bing-wallpaper-url` 返回直链）

### 其他
- 列删除用独立按钮行（`col-del-row`），不是 hover 隐藏
- 预览图 `refreshPreview()` 在增删行列/拖拽排序后自动刷新
- `line.html` 线条用 CSS 变量 `--line-x` `--line-y`，JS 根据列宽/表头行高动态更新

## 已知待做
1. **表格选区复制数据**：用户拖选单元格 → 写入剪贴板 → 粘贴到 PSD
   - 计划已写在 `C:\Users\Emotion\.claude\plans\glimmering-enchanting-blum.md`
   - 用 html2canvas（已加载 CDN）渲染选中区域
   - `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])`
2. 批量上传（可行但未开始）

## 用户当前需求
用户最新一条消息："我需要你的记忆和上下文，交给下一个claude执行。请你输出一个文件"
→ 就是本文件。

## 注意事项
- `prompt.py` 的函数（`build_ocr_prompt`, `build_ocr_system_message`）**未被 vision.py 使用**，vision.py 用的是内联 prompt。用户曾在 prompt.py 里手改过规则，但那些改动不会生效！
- Vercel 部署自动从 `main` 分支，改动后需要 `git checkout main && git merge style-feature && git push origin main`
- 本地改 HTML/CSS 刷新浏览器即可，改 Python 需重启服务器
- JavaScript 全在 `index.html` 的 `<script>` 块里，没有独立 JS 文件
- html2canvas 从 CDN 加载：`<script src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"></script>`
- DashScope API Key 在 `config.py:38` 有硬编码默认值，优先级：UI输入 > config.json > .env > DEFAULT_API_KEY
