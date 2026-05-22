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

    # 根据 font_weight 替换 @font-face 中的字体文件路径
    style_tag = soup.find("style")
    if style_tag and style_tag.string:
        css = str(style_tag.string)
        font_path, css_weight = FONT_WEIGHTS.get(font_weight, FONT_WEIGHTS["medium"])
        css = re.sub(r"url\('/font/[^']+'\)", f"url('/font/{font_path}')", css)
        css = re.sub(r"format\('[^']+'\)", "format('woff2')", css)
        css = re.sub(r"font-weight:\s*\d+", f"font-weight: {css_weight}", css)
        style_tag.string.replace_with(css)

    # 注入导出配置：覆盖 body 和 table 的尺寸样式
    _inject_export_config(soup, export_config)

    table = soup.find("table")
    if not table:
        return html

    # 全局默认列宽
    default_w = col_widths.get("_default", 80)

    # 重建 thead：只包含数据中实际有的列
    thead = table.find("thead")
    if thead:
        thead.clear()
        tr = soup.new_tag("tr")
        for i, h in enumerate(headers):
            th = soup.new_tag("th")
            th.string = str(h)
            w = col_widths.get(str(i), default_w)
            th["style"] = f"width:{w}px;min-width:{w}px;height:{header_height}px;line-height:{header_height}px;padding:2px 6px;"
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
            td["style"] = f"width:{w}px;min-width:{w}px;height:{rh}px;line-height:{rh}px;padding:2px 6px;"
            tr.append(td)
        tbody.append(tr)

    return str(soup)


def _inject_export_config(soup, export_config):
    """注入导出配置：覆盖 body 宽/留白 和 table 宽"""
    bg_width = export_config.get("bgWidth", 1200)
    table_width = export_config.get("tableWidth", 1090)
    padding = export_config.get("padding", 55)

    # 覆盖 body 样式
    body = soup.find("body")
    if body:
        existing = body.get("style", "") if isinstance(body.get("style"), str) else ""
        body["style"] = f"width:{bg_width}px;margin:0;padding:{padding}px 0;background:#ffffff;box-sizing:border-box;{existing}"

    # 覆盖 html 样式（确保全页截图宽度）
    html_tag = soup.find("html")
    if html_tag:
        existing = html_tag.get("style", "") if isinstance(html_tag.get("style"), str) else ""
        html_tag["style"] = f"width:{bg_width}px;margin:0;padding:0;background:#ffffff;{existing}"

    # 覆盖 table 样式
    table = soup.find("table")
    if table:
        existing = table.get("style", "") if isinstance(table.get("style"), str) else ""
        table["style"] = f"width:{table_width}px;table-layout:fixed;margin:0 auto;{existing}"


def _get_font_face_css(font_weight):
    """根据字重返回 Playwright 可用的 @font-face CSS（使用 file:// 路径）"""
    font_path, css_weight = FONT_WEIGHTS.get(font_weight, FONT_WEIGHTS["medium"])
    abs_path = os.path.join(APP_DIR, "font", font_path)
    font_url = f"file:///{abs_path.replace(os.sep, '/')}"
    return f"@font-face {{ font-family: 'PingFangSC'; src: url('{font_url}') format('woff2'); font-weight: {css_weight}; }}"


async def render_html_to_png(html, font_weight="medium", export_config=None):
    """将 HTML 渲染为 PNG"""
    if export_config is None:
        export_config = {}
    bg_width = export_config.get("bgWidth", 1200)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": bg_width, "height": 900})
        await page.set_content(html, wait_until="load")
        font_css = _get_font_face_css(font_weight)
        await page.add_style_tag(content=font_css)
        await page.wait_for_timeout(500)
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
