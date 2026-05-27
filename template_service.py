"""模板引擎 — 解析模板 + 填入OCR数据 + 生成预览图"""

import os
import re
import asyncio
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

from config import APP_DIR

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "template")

# 字体字重映射: key → (相对于 font/ 的文件路径, CSS font-weight 值)
FONT_WEIGHTS = {
    "ultralight": ("PingFangSC/woff2/PingFangSC-Ultralight.woff2", "100"),
    "thin":       ("PingFangSC/woff2/PingFangSC-Thin.woff2", "200"),
    "light":      ("PingFangSC/woff2/PingFangSC-Light.woff2", "300"),
    "regular":    ("PingFangSC/woff2/PingFangSC-Regular.woff2", "400"),
    "medium":     ("PingFangSC-Medium.woff2", "500"),
    "semibold":   ("PingFangSC/woff2/PingFangSC-Semibold.woff2", "600"),
}

# 默认导出配置
DEFAULT_EXPORT_CONFIG = {
    "bgWidth": 1200,
    "tableWidth": 1090,
    "padding": 55,
}


def list_templates():
    """列出所有模板"""
    result = []
    if not os.path.isdir(TEMPLATE_DIR):
        return result
    for fname in sorted(os.listdir(TEMPLATE_DIR)):
        if fname.endswith(".html"):
            name = fname.replace(".html", "")
            result.append({
                "id": fname,
                "name": name,
            })
    return result


def parse_template_headers(html):
    """解析模板 HTML 中 thead 的表头文本"""
    soup = BeautifulSoup(html, "html.parser")
    thead = soup.find("thead")
    if not thead:
        return []
    ths = thead.find_all("th")
    return [th.get_text(strip=True) for th in ths]


def fill_template(html, table_data, col_widths=None, row_heights=None,
                  header_height=None, font_weight="medium", export_config=None):
    """将 OCR 数据填入模板 HTML，动态生成 thead 和 tbody"""
    headers = table_data.get("headers", [])
    rows = table_data.get("rows", [])
    if col_widths is None:
        col_widths = {}
    if row_heights is None:
        row_heights = {}
    if header_height is None:
        header_height = 72
    if export_config is None:
        export_config = {}

    default_row_h = row_heights.get("_default", 72)

    if not headers:
        return html

    soup = BeautifulSoup(html, "html.parser")

    # 根据 font_weight 注入 @font-face（含正确的 font-weight 描述符）
    font_path, css_weight = FONT_WEIGHTS.get(font_weight, FONT_WEIGHTS["medium"])
    style_tag = soup.find("style")
    if style_tag:
        css = str(style_tag.string) if style_tag.string else ""
        # 移除已有的引用 /font/ 的 @font-face 块（避免残留错误的 font-weight）
        css = re.sub(r"@font-face\s*\{[^}]*?/font/[^}]*?\}", "", css)
        # 注入正确的 @font-face，font-weight 描述符匹配选中字重
        css = f"@font-face {{ font-family: 'PingFangSC'; src: url('/font/{font_path}') format('woff2'); font-weight: {css_weight}; }}\n" + css
        style_tag.string.replace_with(css)

    table = soup.find("table")
    if not table:
        return html

    # 全局默认列宽 + 计算表格总宽
    default_w = col_widths.get("_default", 155)
    col_ws = []
    for i in range(len(headers)):
        col_ws.append(col_widths.get(str(i), default_w))
    total_table_w = sum(col_ws)

    # 注入导出配置 — 传入实际表格宽度，动态调整图片尺寸
    _inject_export_config(soup, export_config, total_table_w)

    # line 模板装饰线位置 —— 覆盖默认值，留白+多余背景宽度让线延伸到表格外
    first_col_w = col_widths.get("0", default_w)
    bg_w = export_config.get("bgWidth", 1200)
    pad = export_config.get("padding", 55)
    extra = max(0, (bg_w - total_table_w - 2 * pad) / 2)
    line_offset = pad + extra
    existing = table.get("style", "") if isinstance(table.get("style"), str) else ""
    sep = "" if not existing or existing.endswith(";") else ";"
    table["style"] = f"{existing}{sep}--line-x:{first_col_w}px;--line-y:{header_height}px;--line-offset:{line_offset:.0f}px;"

    # 用 <colgroup> 控制列宽 — table-layout:fixed 下最可靠的方式
    colgroup = soup.new_tag("colgroup")
    for w in col_ws:
        col = soup.new_tag("col")
        col["style"] = f"width:{w}px;"
        colgroup.append(col)
    # 替换已有 colgroup 或插入到 table 最前面
    existing_colgroup = table.find("colgroup")
    if existing_colgroup:
        existing_colgroup.replace_with(colgroup)
    else:
        table.insert(0, colgroup)

    # 重建 thead：只包含数据中实际有的列
    thead = table.find("thead")
    if thead:
        thead.clear()
        tr = soup.new_tag("tr")
        for i, h in enumerate(headers):
            th = soup.new_tag("th")
            th.string = str(h)
            w = col_widths.get(str(i), default_w)
            th["style"] = f"height:{header_height}px;line-height:{header_height}px;padding:0 6px;font-family:'PingFangSC','PingFang SC',sans-serif;font-weight:{css_weight};"
            tr.append(th)
        thead.append(tr)

    # 重建 tbody：只输出数据中实际有的列
    tbody = table.find("tbody")
    if not tbody:
        tbody = soup.new_tag("tbody")
        table.append(tbody)
    tbody.clear()

    for ri, row in enumerate(rows):
        tr = soup.new_tag("tr")
        rh = row_heights.get(str(ri), default_row_h)
        for ci in range(len(headers)):
            td = soup.new_tag("td")
            val = row[ci] if ci < len(row) and row[ci] is not None else ""
            td.string = str(val)
            w = col_widths.get(str(ci), default_w)
            td["style"] = f"height:{rh}px;line-height:{rh}px;padding:0 6px;font-family:'PingFangSC','PingFang SC',sans-serif;font-weight:{css_weight};"
            tr.append(td)
        tbody.append(tr)

    return str(soup)


def _inject_export_config(soup, export_config, total_table_w=None):
    """注入导出配置：flexbox 居中 + 四边留白，列多时自动扩展图片宽高"""
    bg_w_min = export_config.get("bgWidth", 1200)
    bg_h_min = export_config.get("bgHeight", 0) or 0
    padding = export_config.get("padding", 55)
    # 图片宽度 = max(用户设定, 表格宽 + 两边留白)
    actual_w = max(bg_w_min, (total_table_w or 0) + 2 * padding)

    # html
    html_tag = soup.find("html")
    if html_tag:
        html_tag["style"] = f"margin:0;padding:0;overflow:hidden;"

    # body — flexbox 居中表格，padding 四边留白，bgHeight>0 时设 min-height
    body = soup.find("body")
    if body:
        minh = f"min-height:{bg_h_min}px;" if bg_h_min > 0 else ""
        body["style"] = f"width:{actual_w}px;margin:0;padding:{padding}px;box-sizing:border-box;overflow:hidden;{minh}"

    # table — 不设 width，由 <colgroup> 列宽自然决定总宽
    table = soup.find("table")
    if table:
        existing = table.get("style", "") if isinstance(table.get("style"), str) else ""
        table["style"] = f"table-layout:fixed;margin:0 auto;{existing}"



def _chromium_available():
    """检查 Playwright Chromium 是否已安装（快速路径，避免 Vercel 上超时挂死）"""
    import sys
    try:
        if sys.platform == "win32":
            base = os.path.expandvars(r"%LOCALAPPDATA%\ms-playwright")
        elif sys.platform == "darwin":
            base = os.path.expanduser("~/Library/Caches/ms-playwright")
        else:
            base = os.path.expanduser("~/.cache/ms-playwright")
        if os.path.isdir(base):
            for root, dirs, _ in os.walk(base):
                for d in dirs:
                    if "chromium" in d.lower():
                        return True
    except Exception:
        pass
    return False


async def render_html_to_png(html, font_weight="medium", export_config=None):
    """将 HTML 渲染为 PNG，视口宽度匹配 body 实际宽度"""
    if not _chromium_available():
        raise RuntimeError("Chromium not available (Vercel/EXE environment)")
    if export_config is None:
        export_config = {}
    # 从 HTML 中提取 body 的实际宽度
    m = re.search(r'body[^>]*width:(\d+)px', html)
    actual_w = int(m.group(1)) if m else export_config.get("bgWidth", 1200)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": actual_w, "height": 600})
        # 把 HTML 中的 /font/... 替换为 localhost 绝对路径，Playwright 才能加载
        html = re.sub(r"url\('/font/", f"url('http://localhost:5800/font/", html)
        await page.set_content(html, wait_until="networkidle")
        try: await page.evaluate("document.fonts.ready")
        except: pass
        await page.wait_for_timeout(300)
        body_el = await page.query_selector("body")
        if body_el:
            img = await body_el.screenshot(type="png")
        else:
            img = await page.screenshot(type="png", full_page=True)
        await browser.close()
        return img


def render_png(html, font_weight="medium", export_config=None):
    """同步包装"""
    return asyncio.run(render_html_to_png(html, font_weight, export_config))


def get_preview_path(template_id):
    """获取预览图路径，如果不存在则生成"""
    preview_dir = os.path.join(TEMPLATE_DIR, ".previews")
    os.makedirs(preview_dir, exist_ok=True)
    png_path = os.path.join(preview_dir, template_id.replace(".html", ".png"))
    if not os.path.exists(png_path):
        html_path = os.path.join(TEMPLATE_DIR, template_id)
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()
        png_bytes = render_png(html)
        with open(png_path, "wb") as f:
            f.write(png_bytes)
    return png_path
