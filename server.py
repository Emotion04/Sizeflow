"""工厂尺码表转换工具 — Flask 路由入口"""

import os
import sys
import traceback
import threading
import time
import webbrowser

from flask import Flask, request, jsonify, render_template

from config import (
    APP_DIR, AVAILABLE_MODELS, DEFAULT_MAPPINGS,
    current_model, current_mappings, _api_key,
    set_api_key, persist,
)
from vision import call_ocr_vision, extract_json, save_base64_image

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
        result = extract_json(raw_text)

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


# ---- Startup ----

def open_browser():
    time.sleep(1.2)
    webbrowser.open("http://localhost:5800")


if __name__ == "__main__":
    print("=" * 48)
    print("  工厂尺码表转换工具 v1.0")
    print(f"  模型: {current_model}  |  temperature: {os.getenv('QWEN_TEMPERATURE', '0.0')}")
    print(f"  打开浏览器: http://localhost:5800")
    print("=" * 48)
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host="0.0.0.0", port=5800, debug=False)
