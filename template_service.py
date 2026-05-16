"""模板引擎 — 解析模板 + 填入OCR数据 + 生成预览图"""

import os
import re
import asyncio
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "template")

# 列名模糊匹配映射（模板列名 → OCR 输出列名）
HEADER_ALIAS = {
    "尺码(CM)": "尺码",
    "尺码/cm": "尺码",
    "腰围": "腰围",
    "臀围": "臀围",
    "大腿围": "大腿围",
    "脚围": "脚围",
    "裤长(常规)": "常规裤长",
    "常规裤长": "常规裤长",
    "裤长(高个子)": "加长裤长",
    "裤长(加长)": "加长裤长",
    "加长裤长": "加长裤长",
    "裤长(小个子)": "小个子裤长",
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


def fill_template(html, table_data):
    """将 OCR 数据填入模板 HTML，替换 tbody 内容"""
    headers = table_data.get("headers", [])
    rows = table_data.get("rows", [])

    soup = BeautifulSoup(html, "html.parser")

    # 解析模板表头
    tpl_headers = parse_template_headers(html)
    if not tpl_headers:
        return html  # 无法解析，返回原样

    # 建立 OCR 列 → 模板列索引的映射
    col_map = {}  # ocr_col_index → tpl_col_index
    for ti, th_text in enumerate(tpl_headers):
        matched = HEADER_ALIAS.get(th_text, th_text)
        for oi, oh in enumerate(headers):
            if oh == matched:
                col_map[oi] = ti
                break

    # 重建 tbody
    tbody = soup.find("tbody")
    if not tbody:
        return html
    tbody.clear()

    for row in rows:
        tr = soup.new_tag("tr")
        for ti in range(len(tpl_headers)):
            td = soup.new_tag("td")
            # 查找这个模板列对应的 OCR 数据
            data_val = ""
            for oi, ti_mapped in col_map.items():
                if ti_mapped == ti:
                    data_val = row[oi] if oi < len(row) and row[oi] is not None else ""
                    break
            td.string = str(data_val)
            tr.append(td)
        tbody.append(tr)

    # 保留所有 <style> 和原有结构
    return str(soup)


async def render_html_to_png(html):
    """将 HTML 渲染为 PNG，截取表格 + 50px 留白"""
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1200, "height": 900})
        await page.set_content(html, wait_until="networkidle")
        await page.wait_for_timeout(300)
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
