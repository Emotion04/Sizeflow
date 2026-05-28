"""工厂尺码表转换工具 — Flask 路由入口"""

import os
import sys
import json
import glob
import traceback
import threading
import time
import webbrowser

from flask import Flask, request, jsonify, render_template, send_from_directory

from config import (
    APP_DIR, APP_VERSION, AVAILABLE_MODELS, DEFAULT_MAPPINGS,
    current_model, current_mappings, _api_key,
    set_api_key, persist,
)
from vision import call_ocr_vision, parse_transcription, format_numbers, save_base64_image, call_qwen
from stylegen import generate_table_style, generate_table_from_image
from updater import check_update

# ---- Flask App ----
app = Flask(__name__)

if getattr(sys, 'frozen', False):
    app.template_folder = os.path.join(sys._MEIPASS, 'templates')

# ---- Routes ----

@app.route("/")
def index():
    return render_template("index.html", mappings=current_mappings)


@app.route("/api/analyze", methods=["POST"])
def analyze():
    tmp_path = None
    try:
        data = request.json or {}
        image_source = data.get("image", "")
        mappings = data.get("mappings", current_mappings)
        model = data.get("model", current_model)

        if not image_source:
            return jsonify({"success": False, "error": "未提供图片数据"}), 400

        if image_source.startswith("data:") or (
            len(image_source) > 200 and "/" not in image_source[:20]
        ):
            tmp_path = save_base64_image(image_source)
            image_path = tmp_path
        elif os.path.isfile(image_source):
            image_path = image_source
        else:
            return jsonify({
                "success": False,
                "error": f"无效的图片数据或文件不存在：{image_source[:80]}...",
            }), 400

        raw_text = call_ocr_vision(image_path, mappings, model)
        result = parse_transcription(raw_text, mappings)
        format_numbers(result)

        return jsonify({
            "success": True,
            "data": result,
            "raw": raw_text,
            "model": model,
        })

    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


# ---- Debug Mode ----
# Debug 预设数据所需的完整字段映射（工厂名 → 输出名）
DEBUG_MAPPINGS = {
    "腰围（拉平量）": "腰围",
    "上座围(腰下7cm V量)": "上座围",
    "座围(浪上11 cm V量)": "座围",
    "脾围": "大腿围",
    "膝围（浪下29cm）": "膝围",
    "脚围": "脚围",
    "前浪连腰": "前浪",
    "后浪连腰": "后浪",
    "外长连腰B": "外长B",
    "外长连腰C": "外长C",
    "前中拉链89301": "前中拉链",
}

DEBUG_RAW_TEXT = """尺码 | 25.00 | 26.00 | 27.00 | 28.00 | 29.00 | 30.00 | 31.00
腰围（拉平量） | 2.50 | 64.00 | 66.50 | 69.00 | 71.50 | 74.00 | 76.50 | 79.00
上座围(腰下7cm V量) | 2.50 | 78.50 | 81.00 | 83.50 | 86.00 | 88.50 | 91.00 | 93.50
座围(浪上11 cm V量) | 2.50 | 91.50 | 94.00 | 96.50 | 99.00 | 101.50 | 104.00 | 106.50
脾围 | 1.27 | 61.50 | 62.77 | 64.04 | 65.31 | 66.58 | 67.85 | 69.12
膝围（浪下29cm） | 1.00 | 57.50 | 58.50 | 59.50 | 60.50 | 61.50 | 62.50 | 63.50
脚围 | 1.00 | 51.50 | 52.50 | 53.50 | 54.50 | 55.50 | 56.50 | 57.50
前浪连腰 | 0.63 | 29.22 | 29.85 | 30.47 | 31.10 | 31.72 | 32.35 | 32.97
后浪连腰 | 0.63 | 38.22 | 38.85 | 39.47 | 40.10 | 40.72 | 41.35 | 41.97
外长连腰B | 1.00 | 102.00 | 103.00 | 104.00 | 105.00 | 106.00 | 106.50 | 107.00
外长连腰C | 1.00 | 97.00 | 98.00 | 99.00 | 100.00 | 101.00 | 101.50 | 102.00
前中拉链89301 | 5 | 5 | 5 | 5 1/2 | 5 1/2 | 5 1/2 | 5 1/2 | 5 1/2"""


@app.route("/api/debug-analyze", methods=["POST"])
def debug_analyze():
    """使用预设数据模拟 OCR 识别，跳过 API 调用"""
    try:
        data = request.json or {}
        user_mappings = data.get("mappings", {})
        # 合并用户映射和 debug 数据所需的完整映射
        full_mappings = dict(DEBUG_MAPPINGS)
        full_mappings.update(user_mappings)
        result = parse_transcription(DEBUG_RAW_TEXT, full_mappings)
        format_numbers(result)
        return jsonify({
            "success": True,
            "data": result,
            "raw": DEBUG_RAW_TEXT,
            "model": "debug-mode",
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

# ---- Debug Mode End ----

@app.route("/api/key", methods=["GET", "POST"])
def key_handler():
    global _api_key
    if request.method == "POST":
        data = request.json or {}
        new_key = (data.get("api_key") or "").strip()
        set_api_key(new_key)
        persist()
        return jsonify({"success": True, "has_key": bool(_api_key)})
    return jsonify({"success": True, "has_key": bool(_api_key)})


@app.route("/api/mappings", methods=["GET", "POST"])
def mappings_handler():
    global current_mappings
    if request.method == "POST":
        data = request.json
        if isinstance(data, dict):
            current_mappings = dict(data)
            persist()
        return jsonify({"success": True, "mappings": current_mappings})
    return jsonify({"success": True, "mappings": current_mappings})


@app.route("/api/mappings/reset", methods=["POST"])
def reset_mappings():
    global current_mappings
    current_mappings = dict(DEFAULT_MAPPINGS)
    persist()
    return jsonify({"success": True, "mappings": current_mappings})


@app.route("/api/model", methods=["GET", "POST"])
def model_handler():
    global current_model
    if request.method == "POST":
        data = request.json or {}
        new_model = data.get("model", "")
        valid_ids = [m["id"] for m in AVAILABLE_MODELS]
        if new_model in valid_ids:
            current_model = new_model
            persist()
        return jsonify({"success": True, "model": current_model})
    return jsonify({
        "success": True,
        "model": current_model,
        "models": AVAILABLE_MODELS,
    })


@app.route("/api/generate-style", methods=["POST"])
def generate_style():
    """生成带样式的 HTML 尺码表"""
    try:
        data = request.json or {}
        table_data = data.get("data", {})
        style_desc = data.get("style", "简洁、现代、适合服装行业")
        model = data.get("model", "qwen3.6-plus")

        if not table_data.get("headers") or not table_data.get("rows"):
            return jsonify({"success": False, "error": "缺少表格数据"}), 400

        html = generate_table_style(table_data, style_desc, model)
        return jsonify({"success": True, "html": html})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/generate-style-from-image", methods=["POST"])
def generate_style_from_image():
    """从参考图提取风格并生成 HTML 尺码表"""
    tmp_path = None
    try:
        data = request.json or {}
        table_data = data.get("data", {})
        image_source = data.get("image", "")
        model = data.get("model", "qwen3-vl-plus")

        if not table_data.get("headers") or not table_data.get("rows"):
            return jsonify({"success": False, "error": "缺少表格数据"}), 400
        if not image_source:
            return jsonify({"success": False, "error": "未提供参考图片"}), 400

        if image_source.startswith("data:"):
            tmp_path = save_base64_image(image_source)
            image_path = tmp_path
        elif os.path.isfile(image_source):
            image_path = image_source
        else:
            return jsonify({"success": False, "error": "图片无效"}), 400

        html = generate_table_from_image(table_data, image_path, model)
        return jsonify({"success": True, "html": html})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


@app.route("/api/render-png", methods=["POST"])
def render_png():
    """将 HTML 渲染为 PNG"""
    import asyncio
    from playwright.async_api import async_playwright

    try:
        data = request.json or {}
        html = data.get("html", "")
        if not html:
            return jsonify({"success": False, "error": "缺少 HTML"}), 400

        async def _render():
            async with async_playwright() as p:
                browser = await p.chromium.launch()
                page = await browser.new_page(viewport={"width": 800, "height": 600})
                await page.set_content(html, wait_until="networkidle")
                # 获取表格元素的实际尺寸
                table = await page.query_selector("table")
                if table:
                    bbox = await table.bounding_box()
                    if bbox:
                        # 截表格元素
                        img = await table.screenshot(type="png")
                        await browser.close()
                        return img
                # fallback: 截全页
                img = await page.screenshot(type="png", full_page=True)
                await browser.close()
                return img

        png_bytes = asyncio.run(_render())

        from flask import Response
        return Response(png_bytes, mimetype="image/png",
                        headers={"Content-Disposition": "attachment; filename=sizechart.png"})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/templates", methods=["GET"])
def list_templates_route():
    """列出所有模板（含预览图路径）"""
    from template_service import list_templates, get_preview_path
    templates = list_templates()
    for t in templates:
        t["preview"] = f"/api/template-preview/{t['id']}"
    return jsonify({"success": True, "templates": templates})


@app.route("/api/template-preview/<template_id>")
def template_preview(template_id):
    """返回模板预览图 PNG"""
    from template_service import get_preview_path
    from flask import send_file
    try:
        png_path = get_preview_path(template_id)
        return send_file(png_path, mimetype="image/png")
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 404


@app.route("/font/<path:filename>")
def serve_font(filename):
    """服务字体文件（允许跨域，Playwright 渲染需要）"""
    font_dir = os.path.join(APP_DIR, "font")
    resp = send_from_directory(font_dir, filename)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route("/api/apply-template", methods=["POST"])
def apply_template():
    """将 OCR 数据填入模板，返回 HTML"""
    import os as _os
    from template_service import TEMPLATE_DIR, fill_template

    try:
        data = request.json or {}
        template_id = data.get("template", "")
        table_data = data.get("data", {})

        if not template_id or not table_data:
            return jsonify({"success": False, "error": "缺少参数"}), 400

        tpl_path = _os.path.join(TEMPLATE_DIR, template_id)
        if not _os.path.isfile(tpl_path):
            return jsonify({"success": False, "error": "模板不存在"}), 404

        with open(tpl_path, "r", encoding="utf-8") as f:
            html = f.read()

        col_widths = data.get("colWidths", {})
        row_heights = data.get("rowHeights", {})
        header_height = data.get("headerHeight", 72)
        font_weight = data.get("fontWeight", "medium")
        font_size = data.get("fontSize", 28)
        export_config = data.get("exportConfig", {})
        filled_html = fill_template(html, table_data, col_widths, row_heights, header_height, font_weight, font_size, export_config)
        return jsonify({"success": True, "html": filled_html})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/render-template-png", methods=["POST"])
def render_template_png():
    """填入数据并渲染为 PNG 下载"""
    import os as _os
    from template_service import TEMPLATE_DIR, fill_template, render_png

    try:
        data = request.json or {}
        template_id = data.get("template", "")
        table_data = data.get("data", {})

        if not template_id or not table_data:
            return jsonify({"success": False, "error": "缺少参数"}), 400

        tpl_path = _os.path.join(TEMPLATE_DIR, template_id)
        if not _os.path.isfile(tpl_path):
            return jsonify({"success": False, "error": "模板不存在"}), 404

        with open(tpl_path, "r", encoding="utf-8") as f:
            html = f.read()

        col_widths = data.get("colWidths", {})
        row_heights = data.get("rowHeights", {})
        header_height = data.get("headerHeight", 72)
        font_weight = data.get("fontWeight", "medium")
        font_size = data.get("fontSize", 28)
        export_config = data.get("exportConfig", {})
        filled_html = fill_template(html, table_data, col_widths, row_heights, header_height, font_weight, font_size, export_config)
        png_bytes = render_png(filled_html, font_weight, export_config)

        from flask import Response
        return Response(png_bytes, mimetype="image/png",
                        headers={"Content-Disposition": f"attachment; filename=sizechart_{template_id.replace('.html','')}.png"})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/check-update", methods=["GET"])
def api_check_update():
    """检查新版本（仅 EXE 模式生效）"""
    return jsonify(check_update())


@app.route("/api/open-download", methods=["POST"])
def api_open_download():
    """手动打开下载页面"""
    from updater import open_download_page
    open_download_page()
    return jsonify({"success": True})


@app.route("/api/wallpapers", methods=["GET"])
def list_wallpapers():
    """列出所有可用壁纸：本地文件 + Bing 每日"""
    import os as _os, glob
    wp_dir = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "static", "wallpapers")
    _os.makedirs(wp_dir, exist_ok=True)
    local = []
    for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
        for f in glob.glob(_os.path.join(wp_dir, ext)):
            local.append({
                "id": _os.path.basename(f),
                "name": _os.path.basename(f).rsplit(".", 1)[0],
                "url": f"/static/wallpapers/{_os.path.basename(f)}",
                "source": "local",
            })
    return jsonify({
        "success": True,
        "wallpapers": [
            {"id": "bing-daily", "name": "Bing 每日壁纸", "url": "/api/bing-wallpaper", "source": "bing"},
        ] + local,
    })


@app.route("/api/bing-wallpaper-url")
def bing_wallpaper_url():
    """获取 Bing 每日壁纸直链（轻量，只返回URL）"""
    import urllib.request
    try:
        r = urllib.request.urlopen("https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1", timeout=8)
        data = json.loads(r.read())
        img_url = "https://www.bing.com" + data["images"][0]["url"]
        return jsonify({"success": True, "url": img_url})
    except Exception:
        return jsonify({"success": False}), 502


@app.route("/api/bing-wallpaper")
def bing_wallpaper():
    """代理 Bing 每日壁纸图片数据（壁纸面板预览用）"""
    import urllib.request
    try:
        r = urllib.request.urlopen("https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1", timeout=10)
        data = json.loads(r.read())
        img_url = "https://www.bing.com" + data["images"][0]["url"]
        img_data = urllib.request.urlopen(img_url, timeout=15).read()
        from flask import Response
        return Response(img_data, mimetype="image/jpeg")
    except Exception:
        return jsonify({"error": "Bing 壁纸获取失败"}), 502


@app.route("/api/changelog", methods=["GET"])
def api_changelog():
    """返回最近 git commit 记录，失败时回退到缓存文件"""
    import subprocess
    commits = None
    # 尝试 git log
    try:
        result = subprocess.run(
            ["git", "log", "-20", "--pretty=format:%h|%s|%ar"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=5, cwd=APP_DIR
        )
        output = result.stdout.decode("utf-8", errors="replace") if result.stdout else ""
        if result.returncode == 0 and output:
            commits = []
            for line in output.strip().split("\n"):
                if not line: continue
                parts = line.split("|", 2)
                if len(parts) == 3:
                    commits.append({"hash": parts[0], "msg": parts[1], "date": parts[2]})
    except Exception:
        pass
    # git 失败时用缓存
    if not commits:
        cache_path = os.path.join(APP_DIR, "changelog_cache.json")
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                commits = json.load(f).get("commits", [])
        except Exception:
            commits = []
    return jsonify({"success": True, "commits": commits or []})

# ---- Startup ----

def sync_changelog_cache():
    """启动时自动同步 git log 到 changelog_cache.json"""
    import subprocess
    cache_path = os.path.join(APP_DIR, "changelog_cache.json")
    try:
        result = subprocess.run(
            ["git", "log", "-60", "--pretty=format:%h|%s|%ar"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=5, cwd=APP_DIR
        )
        output = result.stdout.decode("utf-8", errors="replace") if result.stdout else ""
        if result.returncode == 0 and output:
            commits = []
            for line in output.strip().split("\n"):
                if not line: continue
                parts = line.split("|", 2)
                if len(parts) == 3:
                    commits.append({"hash": parts[0], "msg": parts[1], "date": parts[2]})
            if commits:
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump({"commits": commits}, f, ensure_ascii=False, indent=2)
    except Exception:
        pass  # git 不可用时保留现有缓存

def open_browser():
    time.sleep(1.2)
    webbrowser.open("http://localhost:5800")


if __name__ == "__main__":
    print("=" * 48)
    print(f"  工厂尺码表转换工具 v{APP_VERSION}")
    print(f"  模型: {current_model}  |  temperature: {os.getenv('QWEN_TEMPERATURE', '0.0')}")
    print(f"  打开浏览器: http://localhost:5800")
    print("=" * 48)
    sync_changelog_cache()
    check_update()
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host="0.0.0.0", port=5800, debug=False)
