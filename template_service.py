"""模板引擎 — 解析模板 + 填入OCR数据 + 生成预览图"""

import os
import re
import asyncio
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "template")

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


def fill_template(html, table_data, col_widths=None, row_heights=None):
    """将 OCR 数据填入模板 HTML，动态生成 thead 和 tbody"""
    headers = table_data.get("headers", [])
    rows = table_data.get("rows", [])
    if col_widths is None:
        col_widths = {}
    if row_heights is None:
        row_heights = {}

    default_row_h = row_heights.get("_default", 36)

    if not headers:
        return html

    soup = BeautifulSoup(html, "html.parser")

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
            th["style"] = f"width:{w}px;min-width:{w}px;"
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
            td["style"] = f"width:{w}px;min-width:{w}px;height:{rh}px;line-height:{rh}px;"
            tr.append(td)
        tbody.append(tr)

    return str(soup)


async def render_html_to_png(html):
    """将 HTML 渲染为 PNG，截取表格 + 50px 留白"""
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1200, "height": 900})
        await page.set_content(html, wait_until="load")
        await page.wait_for_timeout(200)
        container = await page.query_selector(".size-chart-container, .size-table, table")
        if not container:
            container = await page.query_selector("body")
        if container:
            bbox = await container.bounding_box()
            if bbox:
                img = await page.screenshot(type="png", clip={
                    "x": max(0, bbox["x"] - 50),
                    "y": max(0, bbox["y"] - 50),
                    "width": bbox["width"] + 100,
                    "height": bbox["height"] + 100,
                })
                await browser.close()
                return img
        img = await page.screenshot(type="png")
        await browser.close()
        return img


def render_png(html):
    """同步包装"""
    return asyncio.run(render_html_to_png(html))


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
