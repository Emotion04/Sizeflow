# 工厂尺码表转换工具

上传工厂尺码表图片，AI 自动识别并转换为用户尺码表。可编辑、导出、部署。

## 功能

- **图片上传**：拖拽 / 点选 / Ctrl+V 粘贴 / 本地文件路径
- **AI 识别**：调用阿里云 DashScope Qwen 多模态模型，两步式 OCR 提取表格数据
- **字段映射**：工厂表头名称 → 用户表头名称（可自定义增删改）
- **结果编辑**：点击单元格编辑、添加/删除行列、拖拽排序列、调节列宽
- **模型切换**：界面下拉选择 Qwen3-VL Plus / Qwen3.6 Plus / Qwen3.6 Flash 等
- **导出**：下载 CSV（Excel 直接打开）或复制到剪贴板
- **API Key 界面输入**：无需配置环境变量，打开页面直接输入保存

## 原理

```
上传图片 → Flask 后端 → DashScope Qwen 多模态 API
                            │
                    ┌───────┴────────┐
                    │ 第一步：逐行转录 │  ← 强制模型先"读"再"想"
                    │ 第二步：匹配映射 │  ← 按映射表重命名并输出 JSON
                    └───────┬────────┘
                            ↓
                     前端可编辑表格 ← 导出 CSV
```

Prompt 位于 `server.py` 的 `build_prompt()` 函数。核心策略是**两步式 OCR**：先让模型逐行抄写表格内容，再从抄写结果中匹配工厂字段名并重命名输出，从而阻断模型跳过"阅读"直接编造数据。

## 快速开始

### 方式一：exe 双击运行（推荐分发给同事）

1. 从 [Releases](https://github.com/Emotion04/Sizeflow/releases) 下载 `server.exe`
2. 双击启动，浏览器自动打开
3. 在页面右上角输入 DashScope API Key，点保存
4. 上传工厂尺码表图片 → 开始识别

### 方式二：源码运行

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 启动
python server.py

# 3. 打开浏览器 http://localhost:5800
```

### 方式三：Vercel 部署

```bash
# 部署后在 Vercel Dashboard → Settings → Environment Variables 添加：
DASHSCOPE_API_KEY = sk-your-api-key

# 项目已包含 vercel.json + api/index.py，直接导入 GitHub 仓库即可
```

## 获取 API Key

前往 [阿里云百炼平台](https://help.aliyun.com/zh/model-studio/get-api-key) 获取 DashScope API Key。

## 分发

发给同事只需要一个文件夹：

```
sizechart-tool/
├── server.exe   ← 双击启动
└── (首次打开后在页面输入 API Key，自动保存)
```

不再需要配置 `.env` 文件。

## 技术栈

- **后端**：Python Flask + DashScope SDK
- **AI 模型**：阿里云 Qwen 多模态（Qwen3-VL / Qwen3.6）
- **前端**：纯 HTML/CSS/JS（零框架）
- **打包**：PyInstaller → 单文件 exe
- **部署**：兼容 Vercel Serverless
