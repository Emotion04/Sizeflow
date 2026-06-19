# 重构踩坑记录

> 日期: 2026-06-16 ~ 2026-06-18  
> 事件: Sizeflow 项目模块化重构 + 文案生成模块新增  
> 教训: 多次修改仍失败的问题及其根因分析

---

## 坑 1：侧边栏从上到下排列（4 次修复才成功）

### 现象
`.main-row` 使用 `display:flex` 设定了左右布局（`main-left` + `sidebar-card`），但实际渲染时侧边栏始终在下方，即使缩放页面到极小也不变回左右排列。

### 尝试过的修复（均失败）
1. 改 CSS `flex` 比例（`flex:1` / `flex:2`）— 无效
2. 改 `min-width` / `max-width` — 无效
3. 改响应式断点从 1200px → 900px — 无效
4. 给 `#tabSizeChart` 加 `display:contents` — 未尝试（会引发其他问题）

### 根因
**在 HTML 中新增了一个 `<div id="tabSizeChart">` 包裹层来配合 Tab 切换逻辑，这个包裹层套在整个 `.container` 外面。** 虽然理论上一个 `display:block` 的 div 不应该影响子元素的 flex 布局，但实际浏览器渲染中，这个额外嵌套层改变了 `.main-row` 所处的格式化上下文（formatting context），导致 flex 失效。

### 最终修复
**去掉包裹层，改用容器本身做 Tab 切换：**

```html
<!-- 旧（错误） -->
<div id="tabSizeChart">
  <div class="container">
    <div class="main-row">...</div>
  </div>
</div>

<!-- 新（正确） -->
<div class="container" id="sizechartContainer">
  <div class="main-row">...</div>
</div>
```

Tab 切换直接 toggle 两个平级容器的 `hidden` 类，不加任何中间包裹。

### 教训
**重构时尽量不要在现有 DOM 树中插入额外的包裹层。** 即使理论上无害，实际渲染行为可能出乎意料。优先用现有元素做状态切换，而不是加新容器。

---

## 坑 2：文案 Tab 完全空白（4 次修复才成功）

### 现象
切换到"文案生成"Tab 后页面一片空白，F12 无任何错误。

### 根因链

**原因 1：JS 注入时机错误**
`CW.init()` 只在 `switchTab('copywriter')` 时调用，但该函数内部用 `document.getElementById()` 查找 DOM 容器。如果容器因包裹层问题不可达，`_injectHTML()` 会 `if (!container) return;` **静默返回**，不报错。

**原因 2：容器 ID 漂移**
HTML 重构过程中容器 ID 从 `cwContainer` 变到 `cwContent`（因为去掉了中间包裹层），但 JS 中未同步更新，导致 `getElementById` 找不到元素。

**原因 3：`activate()` 引用了不存在的 DOM**
`CW.activate()` / `CW.deactivate()` 方法内部尝试 `getElementById('tabCopywriter')` 并手动 toggle `hidden` 类，但 Tab 切换逻辑已移到 `switchTab()` 函数中，这些 DOM ID 不再存在。

### 最终修复
1. `CW.init()` 移到 `copywriter.js` 文件末尾，**页面加载时自动执行一次**
2. 容器 ID 同步为 `cwContent`
3. `activate()` / `deactivate()` 只做数据同步，不再操作 DOM 显示/隐藏

### 教训
- **静默失败是前端调试的头号杀手**。`getElementById` 找不到元素时返回 `null`，不会抛错。所有 DOM 查找都应该有防御性检查或 console.warn
- **JS 初始化时机要明确**。Tab 内的 HTML 应该在页面加载时就注入，Tab 切换只管显示/隐藏
- **不要把同一职责分散在多个函数里**。Tab 显示/隐藏由 `switchTab` 统一管理，模块内部方法不该重复操作

---

## 坑 3：Flask SSE 路由报 "working outside of request context"

### 现象
调用 `/api/copywriter/generate` 时 Flask 抛出 `RuntimeError: working outside of request context`。

### 根因
Flask 的 `request` 对象只在路由处理函数的执行期间有效。SSE 路由使用了 generator（`yield`），当 generator 内部代码执行时，原始的请求上下文已结束：

```python
# 错误写法
@app.route("/api/copywriter/generate", methods=["POST"])
def copywriter_generate_sse():
    def generate():
        data = request.json or {}  # ← 此时 request context 已失效！
        ...
    return Response(generate(), mimetype="text/event-stream")
```

### 最终修复
在进入 generator 之前解析请求体，将数据存入闭包变量：

```python
# 正确写法
def copywriter_generate_sse():
    req_data = request.json or {}  # ← 在 generator 外解析

    def generate():
        data = req_data  # ← 使用闭包变量
        ...
```

### 教训
Flask generator/streaming 响应中，**必须在 `yield` 之前提取 `request` 中的所有数据**。这是 Flask 核心机制，不是 bug。

---

## 坑 4：表格左右滚动失效

### 现象
识别结果表格超出容器宽度后无法向左滚动，左侧列被裁切。

### 根因
CSS 中 `.table-wrap` 同时设置了：
```css
.table-wrap {
  display: flex;
  justify-content: center;  /* ← 居中 */
  overflow-x: auto;          /* ← 滚动 */
}
```

这是 CSS 的**已知 bug**：当 flex 容器的内容溢出时，`justify-content: center` 会导致左侧内容被裁切且无法滚动到达。

### 最终修复
```css
.table-wrap {
  overflow-x: auto;       /* 只用 overflow */
  /* 移除 display:flex 和 justify-content */
}
table {
  margin: 0 auto;         /* 用 table 自身居中 */
}
```

### 教训
**`justify-content: center` + `overflow: auto` 是 CSS 反模式**，永远不会按预期工作。居中用 `margin: 0 auto` 替代。

---

## 坑 5：CSS `&` 语法在纯 CSS 中无效

### 现象
从原 `index.html` 的 `<style>` 块提取 CSS 时，发现液态玻璃效果的上传区伪元素使用了 SCSS 语法：

```css
.upload-zone {
  ...
  &::before { content: ''; ... }
  &::after  { content: ''; ... }
}
```

浏览器解析时，`&` 不是合法的 CSS 选择器，整个规则块被**静默丢弃**，导致边缘高光效果不生效。

### 最终修复
改为合法 CSS：
```css
.upload-zone::before { ... }
.upload-zone::after  { ... }
```

### 教训
**原项目 CSS 一直在用 SCSS 语法但从未编译**。浏览器默默吞掉了这些规则块，液态玻璃的 `::before`/`::after` 装饰从未真正生效。提取到 `main.css` 时纠正了这个问题。

---

## 坑 6：广告卡片完全错误（螃蟹位置、大小、布局全错）

### 现象
用户反馈螃蟹从"文字左边的大螃蟹（44px）"变成了"右下角的小螃蟹（22px）"。

### 根因
**重构时凭记忆写了广告卡片的 HTML，完全没核对原版。** 实际原版结构和我的重构差异巨大：

| 元素 | 原版 | 我的错误重构 |
|------|------|-------------|
| 螃蟹位置 | **文字左侧**，flex row 同行 | `position:absolute; bottom:6px; right:14px` 右下角 |
| 螃蟹大小 | **`font-size:44px`** | `font-size:22px` |
| 布局 | `display:flex; align-items:center; gap:12px` | 无 flex，螃蟹 absolute |
| 背景 | **像素网格纹理**（repeating-linear-gradient） | 无 |
| 卡片 padding | `18px 24px` | `18px` |
| 标题渐变色 | 彩虹六色 (135deg) | 紫粉渐变 (90deg) |
| 标题字号 | `18px` | `13px` |
| 联系方式 | `^ v ^` + 访问统计 | `联系方式:infpc@msn.com` |

整个卡片几乎每个细节都是错的。

### 最终修复
从 git 提取原版 HTML（`git show HEAD:templates/index.html`），逐字节还原。

### 教训
**重构 HTML 时绝不能凭记忆写，必须从 git 提取原版逐行对照。** 广告卡片这种"看起来简单"的组件最容易出错，因为细节多且不影响功能流程（不会报错），只能靠肉眼发现。

---

## 坑 7：Toast 错误提示体验差

### 现象
- 错误文本过长时不换行，超出屏幕
- 错误提示 3 秒消失太快，用户来不及看

### 根因
```css
.toast { white-space: nowrap; }          /* 不换行 */
```
```js
setTimeout(() => el.remove(), 3000);     /* 固定 3 秒 */
```

### 最终修复
```css
.toast { white-space: pre-wrap; word-break: break-word; max-width: 90vw; }
```
```js
const duration = type === 'error' ? 6000 : 3000;
```

---

## 总结

| 坑 | 根因类型 | 关键教训 |
|---|---------|---------|
| 侧边栏错位 | DOM 结构变更 | 不插入额外包裹层，用现有元素做状态切换 |
| 文案 tab 空白 | 静默失败 + ID 漂移 | DOM 查找应有防御性日志；ID 变更必须全局同步 |
| Flask context | 框架机制误解 | generator 内不能访问 request |
| 表格滚动 | CSS 已知 bug | `justify-content:center` 不与 `overflow:auto` 共存 |
| CSS `&` 语法 | 原项目遗留 | SCSS 语法需编译，原项目从未生效 |
| 螃蟹错位 | 误改 inline style | 重构不改 style 属性 |
| Toast 体验 | 细节忽略 | 错误提示需要更长时间和自动换行 |

**最重要的教训**：重构时应**先 diff 后动手**。如果先把重构前后的 HTML 结构做逐行对比，大部分问题可以在写入前发现。
