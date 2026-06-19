# 裤子文案生成模块 — 开发方案

> 版本: v1  
> 日期: 2026-06-16  
> 状态: 方案阶段，待实施

---

## 1. 背景

在 Sizeflow（服装工厂尺码表转换工具）基础上新增裤子文案生成功能。核心痛点：

- AI 经常把低腰错写成中腰 → 通过服务端确定性规则 + prompt 注入解决
- 文案风格不统一 → 风格指南 + prompt 约束
- 出现违规极限词 → prompt 自检 + 服务端正则扫描双重保险

## 2. 目标用户与场景

**目标用户**：同事独立使用（傻瓜式操作）

**操作流程**：
1. 你预先写好风格指南（文本描述 + 文案示例）
2. 同事上传裤子图片 + 提供尺码数据
3. 点击"生成"，AI 一次输出 3 个版本文案
4. 同事选择最优版本 → 复制使用

## 3. 设计决策

| # | 决策项 | 结论 |
|---|--------|------|
| 1 | 用户场景 | C：同事独立使用，操作步骤最少 |
| 2 | UI 架构 | Tab 切换（📏 尺码表工具 / ✍️ 文案生成），共用 index.html |
| 3 | 前端架构 | 纯 HTML/CSS/JS，不引入 React。变量名 `cw_` 前缀避免冲突 |
| 4 | 风格指南 | 文本描述 + 文案示例，写在 `copywriter.py` 常量中 |
| 5 | 风格+多版本 | 合并：一次性 prompt 同时定义调性 + 3 版本差异化角度（版型/面料/穿搭） |
| 6 | 尺码数据来源 | 双路径：从尺码表 Tab 的 resultData 读取 / 在文案 Tab 内上传尺码表复用 OCR |
| 7 | 腰型判定 | 复用已有 OCR → 读"前浪"字段 → 22-24cm 中低腰 / 25-28cm 中高腰 → 异常时弹提醒 + 手动选择 |
| 8 | 卖点识别 | AI 视觉识别（从裤子图片识别刺绣、破洞、猫须等）+ 手动 tag 补充。prompt 约束：自然融入，不逐条罗列 |
| 9 | 生成方式 | 一次生成全部 3 个版本，SSE 流式输出，3 张卡片同时涨文字 |
| 10 | 流式策略 | 边流边显示原始文本（低透明度 opacity:0.2），完成后 JSON.parse 分配 → 正常显示 |
| 11 | 最优推荐 | AI 在 JSON 中标记 `best: true`，最优卡片绿色✅ + 动画移到中间 |
| 12 | 参考图片 | 不需要。AI 只看用户上传的当前裤子图片分析特点 |
| 13 | 文案格式 | 每版本双结构：A = 标题(≤20字) + 主体(100-150字)，B = 卖点分类标题 + 3-5条 bullet point |
| 14 | 合规 | 双层：prompt 列出 banned words + 服务端正则扫描 |

## 4. 架构总览

```
项目文件结构:
├── copywriter.py              ← 后端：风格常量、腰型判定、prompt构建、合规检查
├── server.py                  ← 修改：新增 3 个 /api/copywriter/* 路由
├── templates/
│   └── index.html             ← 修改：Tab导航 + cwContainer + <link>/<script>引用
├── static/
│   ├── css/
│   │   ├── main.css           ← 重构：从 index.html 提取全部 CSS
│   │   └── copywriter.css     ← 新增：文案模块专属样式
│   └── js/
│       ├── html2canvas.min.js ← 现有：第三方库
│       ├── ad-card.js         ← 重构：从 index.html 提取广告卡片 JS
│       ├── sizechart.js       ← 重构：从 index.html 提取尺码表全部 JS
│       └── copywriter.js      ← 新增：文案模块前端逻辑 (CW 命名空间)
└── docs/
    ├── plan-copywriter-module.md  ← 本文档
    └── architecture.md            ← 项目架构文档
```

## 5. 新增 API 端点

### 5.1 POST /api/copywriter/generate（SSE 流式）

**输入**：
```json
{
  "product_images": ["data:image/jpeg;base64,...", "file://path/to/img.jpg"],
  "size_data": {"headers": ["尺码","腰围","前浪连腰",...], "rows": [["26","68","25",...],...]},
  "waist_type": "中高腰",
  "model": "qwen3-vl-plus",
  "manual_tags": ["刺绣", "破洞"]
}
```

**输出**：`text/event-stream`
```
data: {"token":"本"}
data: {"token":"版"}
...
data: [DONE]
```

完成后前端 JSON.parse(fullText) → 结构化文案对象。

### 5.2 POST /api/copywriter/waist-type

**输入**：`{"size_data": {"headers":[...], "rows":[...]}}`

**输出**：`{"success": true, "waist_type": "中高腰", "front_rise": 26}`

### 5.3 POST /api/copywriter/validate

**输入**：`{"text": "这是一条最好的牛仔裤..."}`

**输出**：`{"success": true, "banned_hits": [{"word":"最好","position":5}]}`

## 6. copywriter.py 核心结构

```python
"""裤子文案生成模块"""

# ======== 常量（你维护的部分）========

STYLE_GUIDE = """
韩系简约风，语气柔和自然，多用'舒适''显瘦''修饰'等词，
避免夸张修辞，段落短小精炼...
"""

STYLE_EXAMPLES = """
【示例1】
标题：慵懒感直筒牛仔裤
主体：这条直筒裤型修饰腿型一流，中高腰设计收腹显瘦...
"""

BANNED_WORDS = [
    "最", "第一", "顶级", "极致", "唯一", "全网", "首选",
    "全网第一", "销量第一", "No.1", "绝无仅有", "独一无二",
    "100%", "永久的", "终身的", "极品", "无敌",
]

WAIST_RULES = {(22, 24): "中低腰", (25, 28): "中高腰"}

# ======== 函数 ========

def determine_waist_type(size_data) -> dict:
    """从 OCR 结果中读取前浪值，按规则判定腰型"""

def validate_copy(text: str) -> list:
    """扫描文案中的 banned words，返回命中列表"""

def build_copy_prompt(product_image_paths, size_data, waist_type, manual_tags) -> str:
    """构建完整的多模态文案生成 prompt"""

def parse_copy_json(raw_text: str) -> dict:
    """从 AI 返回文本中提取 JSON，兼容 markdown 包裹等异常"""

def generate_pants_copy(product_images, size_data, waist_type, model, manual_tags) -> dict:
    """主入口：构建消息 → 调用 AI → 解析结果 → 返回结构化文案"""
```

## 7. 前端 UI 设计

### Tab 导航栏
```
┌─────────────────────────────────────────────┐
│  [📏 尺码表工具]  [✍️ 文案生成]             │
└─────────────────────────────────────────────┘
```

### 卡片 1：素材上传（cwUploadCard）
```
┌──────────────────────────────────────────────┐
│ 📷 裤子图片           📏 尺码数据              │
│ ┌─────────────────┐  ┌─────────────────────┐  │
│ │ [拖拽/点击上传]  │  │ ○ 从尺码表结果选取   │  │
│ │  正面 + 反面 +  │  │ ○ 上传尺码表图片     │  │
│ │  细节图         │  │   [上传区 — 复用OCR] │  │
│ └─────────────────┘  └─────────────────────┘  │
│                                               │
│ 🏷️ 补充卖点：[tag1] [tag2] [+添加]             │
│                                               │
│ 📐 腰型：中高腰（前浪 26cm）[✏️手动修改▾]      │
│                                               │
│ [🚀 生成文案]  模型：[qwen3-vl-plus ▾]        │
└──────────────────────────────────────────────┘
```

### 卡片 2：结果展示（cwResultCard，初始隐藏）
- 生成中：3 张卡片并排，opacity:0.2 实时流式文字
- 完成后：正常透明度，最优卡片 `✅推荐` + CSS transition 动画移到中间
- 每张卡片包含：结构A（标题+主体）+ 结构B（卖点+介绍）
- 底部操作：[📋复制] [✏️编辑后确认复制] [🔄重新生成单个]

## 8. 数据流

```
同事操作:
  1. 上传裤子图片（正面/反面/细节）
  2. 选择尺码数据来源
     ├─ 从 resultData 读取（前提：尺码表 Tab 已完成识别）
     └─ 上传尺码表图片 → /api/analyze → resultData
  3. /api/copywriter/waist-type → {waist_type, front_rise}
     异常时弹 toast 提醒 + 手动选择
  4. 手动补充卖点 tag（可选）
  5. 点击"生成文案"
       │
       ▼
  POST /api/copywriter/generate (SSE)
       │
       ├─ copywriter.py: 构建多模态 messages
       │   - system: COPYWRITER_SYSTEM (含 BANNED_WORDS)
       │   - user: [裤子图片] + prompt (含 STYLE_GUIDE + STYLE_EXAMPLES
       │            + 尺码数据 + 腰型 + 卖点)
       ├─ 调用 call_qwen(model=qwen3-vl-plus, stream=True)
       ├─ SSE 逐 token 透传给前端
       └─ 前端累积 fullText → JSON.parse → 3 个版本
       │
       ▼
  6. 前端渲染 3 张版本卡片 → 最优动画 → 同事选择
```

## 9. 实施步骤

### 阶段 1：重构现有代码（零功能变更）
| Step | 内容 | 风险 |
|------|------|------|
| 1.1 | 创建 `static/css/main.css`，提取全部 CSS | 低 |
| 1.2 | 创建 `static/js/ad-card.js`，提取广告卡片 JS | 低 |
| 1.3 | 创建 `static/js/sizechart.js`，提取主逻辑 JS | **高** |
| 1.4 | 精简 `templates/index.html` 为 HTML 骨架 | 中 |
| 1.5 | 全功能回归验证 | — |

### 阶段 2：新增文案模块
| Step | 内容 | 风险 |
|------|------|------|
| 2.1 | 创建 `copywriter.py`（常量 + 腰型判定 + prompt + 合规） | 低 |
| 2.2 | `server.py` 注册 `/api/copywriter/waist-type` | 低 |
| 2.3 | `server.py` 注册 `/api/copywriter/generate`（SSE） | 中 |
| 2.4 | 创建 `static/css/copywriter.css` | 低 |
| 2.5 | 创建 `static/js/copywriter.js` | 中 |
| 2.6 | `index.html` 集成：Tab 导航 + cwContainer + 引用 | 中 |
| 2.7 | SSE 前端对接 + 3 卡渲染 + 动画 | 中 |
| 2.8 | 交互打磨：复制、编辑、重新生成 | 低 |
| 2.9 | 全功能回归验证 | — |

## 10. 验证清单

### 阶段 1 回归
- [ ] 页面加载样式完全不变
- [ ] 上传尺码表图片 → OCR 识别正常
- [ ] 表格编辑（增删行列、拖拽）正常
- [ ] 模板选择 → 预览 → 导出 PNG 正常
- [ ] CSV 导出正常
- [ ] 壁纸切换正常
- [ ] 配置预设保存/加载正常
- [ ] 广告卡片螃蟹交互正常
- [ ] 更新日志正常显示
- [ ] 版本更新检查正常

### 阶段 2 验证
- [ ] Tab 切换正常，模块独立
- [ ] 裤子图片上传正常
- [ ] 腰型自动判定（22-24 中低腰 / 25-28 中高腰）
- [ ] 异常前浪值 toast 提醒 + 手动选择
- [ ] SSE 流式：3 卡低透明度同时涨字
- [ ] 完成后：最优卡✅ + 动画 + 其他卡降低透明度
- [ ] 文案无 banned words
- [ ] 3 版本差异化角度不同
- [ ] 复制 / 编辑后复制正常
