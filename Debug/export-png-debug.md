# Sizeflow 导出 PNG 问题排查文档

## 预期行为

1. 导出 PNG 宽度由用户设定的背景宽（bgWidth，默认1200px）决定
2. 表格宽度由列宽×列数决定，body 内 padding 55px 四边留白
3. 图片高度 = 表格内容高度 + 上下 padding（自动适应，无多余空白）
4. 列宽、行高、字体、留白等参数精确生效
5. 本地 localhost、Vercel 部署、EXE 打包 三种环境导出效果完全一致

## 本地正常的原因

- 本地 `python server.py` → Playwright 可用
- 路径: `/api/render-template-png` → `fill_template()` → `render_png()` → Playwright 渲染
- Playwright 设置视口 `width=actual_bg`，`full_page=True` 截图
- 截图精确等于 body 元素的完整尺寸（含 padding 留白）

## Vercel/EXE 异常的原因

### 根因1：客户端降级路径与服务器路径不一致
- Vercel 无 Playwright 浏览器 → 服务端返回错误
- EXE 内无 Playwright 浏览器 → 同样失败
- 客户端 catch 后走 `html2canvas` 降级路径
- **两条路径的渲染逻辑完全不同**

### 根因2：临时 iframe 硬编码尺寸
```javascript
tmpIframe.style.cssText = '...width:1200px;height:800px;...';
```
- 宽度写死 1200px，不读取 exportConfig.bgWidth
- 高度写死 800px，不跟随表格内容自适应
- html2canvas(body) 可能受 iframe 视口尺寸干扰

### 根因3：html2canvas 对 body 元素渲染不可靠
- body 有 `display:flex` + `box-sizing:border-box` + `padding`
- html2canvas 对 flexbox 和 box-sizing 的渲染存在已知兼容问题
- body 宽度可能计算错误，导致留白丢失

## 修复方案

客户端降级路径完全重写：
1. 从 filledHtml 提取 table 元素，而非依赖 body 渲染
2. 手动构建干净的包装容器（全 inline 样式，零 CSS 类）
3. 容器尺寸 = bgWidth × (table高度 + 2×padding)
4. 包装容器内放 table + padding 留白
5. html2canvas 截取这个干净的包装容器

这与"复制选区为图片"功能使用相同的隔离渲染策略，已在该功能上验证可靠。
