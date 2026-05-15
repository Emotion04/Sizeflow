"""
工厂尺码表转换工具 - 后端服务
使用阿里云 DashScope Qwen 多模态模型识别工厂尺码表图片
"""

import os
import sys
import re
import json
import base64
import tempfile
import traceback
import threading
import time
import webbrowser

from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv
import dashscope

# ---- 路径 & 环境变量 ----
if getattr(sys, 'frozen', False):
    APP_DIR = os.path.dirname(sys.executable)
    env_path = os.path.join(APP_DIR, '.env')
    load_dotenv(env_path)
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))
    load_dotenv()

CONFIG_FILE = os.path.join(APP_DIR, "config.json")

app = Flask(__name__)

if getattr(sys, 'frozen', False):
    app.template_folder = os.path.join(sys._MEIPASS, 'templates')

dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

# ---- 持久化配置读写 ----
def load_config():
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def save_config(data):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception:
        pass

_config = load_config()

# ---- API Key（界面输入 > 配置文件 > .env 环境变量） ----
_api_key = _config.get("api_key", "") or os.getenv("DASHSCOPE_API_KEY", "")

def get_api_key():
    if not _api_key:
        raise ValueError("未配置 API Key，请在页面右上角输入 DashScope API Key")
    return _api_key

# ---- 模型配置 ----
AVAILABLE_MODELS = [
    {"id": "qwen3-vl-plus",   "name": "Qwen3-VL Plus",  "desc": "擅长文档解析，推荐"},
    {"id": "qwen3.6-plus",    "name": "Qwen3.6 Plus",   "desc": "最新一代多模态"},
    {"id": "qwen3.6-flash",   "name": "Qwen3.6 Flash",  "desc": "速度更快，成本更低"},
    {"id": "qwen3-vl-flash",  "name": "Qwen3-VL Flash",  "desc": "视觉快速版"},
    {"id": "qwen3.5-plus",    "name": "Qwen3.5 Plus",    "desc": "上代视觉旗舰"},
    {"id": "qwen3.5-flash",   "name": "Qwen3.5 Flash",   "desc": "上代快速版"},
]

current_model = _config.get("model") or os.getenv("QWEN_MODEL", "qwen3-vl-plus")
TEMPERATURE = float(os.getenv("QWEN_TEMPERATURE", "0.0"))

DEFAULT_MAPPINGS = {
    "腰围": "腰围",
    "座围": "臀围",
    "脾围": "大腿围",
    "外长连腰A": "加长裤长",
    "外长连腰B": "高个子裤长",
}

current_mappings = _config.get("mappings") or dict(DEFAULT_MAPPINGS)


def save_base64_image(b64_string):
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    raw = base64.b64decode(b64_string)

    ext = ".jpg"
    if raw[:4] == b"\x89PNG":
        ext = ".png"
    elif raw[:2] == b"\xff\xd8":
        ext = ".jpg"
    elif raw[:4] == b"RIFF":
        ext = ".webp"

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp.write(raw)
    tmp.close()
    return tmp.name


def build_prompt(mappings):
    factory_keys = list(mappings.keys())
    user_vals = list(mappings.values())
    mapping_lines = "\n".join([f'  "{k}" → "{v}"' for k, v in mappings.items()])
    keys_list = "、".join([f'"{k}"' for k in factory_keys])
    headers_str = ", ".join(['"尺码"'] + [f'"{v}"' for v in user_vals])

    return f"""你是一台精确的表格OCR机器。你必须分两步完成任务，绝不跳过任何一步。

══════════════════════════════════════
第一步：逐行转录表格（必须完成）
══════════════════════════════════════
图片中是一张服装尺码表。表格结构：最左侧列是"部位名称"，顶部行是"尺码代号"。

请逐行抄写表格内容，每一行格式为：
  部位名称 | 数值1 | 数值2 | 数值3 | ...

例如（这是示例，你必须抄写图片中的实际内容）：
  腰围 | 68 | 72 | 76 | 80 | 84
  座围 | 94 | 98 | 102 | 106 | 110
  ...

规则：
- 抄写图片中能看清的所有行，不要遗漏任何一行
- 每个数值严格按图片中显示的原样抄写，不要四舍五入、不要自己添加或删除小数点
- 图片里写"52"就抄"52"，写"52.5"才抄"52.5"，绝不擅自改变
- 看不清的格子用"?"代替

══════════════════════════════════════
第二步：匹配映射并输出JSON
══════════════════════════════════════
现在，从上一步抄写的结果中，只提取包含以下工厂名称的行：
{keys_list}

按下面映射关系重命名：
{mapping_lines}

最终输出严格JSON（不要markdown标记）：
{{"headers":[{headers_str}],"rows":[["尺码值","腰围值","臀围值","大腿围值","加长裤长值","高个子裤长值"],...]}}

要求：
- headers 第一项固定"尺码"，后面按上述顺序排列
- rows 每个数组第一项是尺码代号（如26/27/28或S/M/L），后面依次是各部位数值
- 数值用字符串类型
- 只输出JSON，不要别的"""


def call_qwen_vision(image_path, mappings, model):
    prompt = build_prompt(mappings)
    messages = [
        {
            "role": "system",
            "content": [{"text": "你是一台精确的表格OCR机器。你的唯一任务是：先逐行抄写图片中的表格内容，再根据映射关系输出JSON。你绝不编造数据，绝不修改数值，绝不跳过步骤。"}],
        },
        {
            "role": "user",
            "content": [
                {"image": f"file://{image_path}"},
                {"text": prompt},
            ],
        }
    ]

    print(f"[API] 调用模型: {model}, temperature={TEMPERATURE}")
    print(f"[API] 图片: {image_path}")

    response = dashscope.MultiModalConversation.call(
        api_key=get_api_key(),
        model=model,
        messages=messages,
        temperature=TEMPERATURE,
        top_p=0.01,
    )

    if response.status_code != 200:
        raise Exception(
            f"API 调用失败 (HTTP {response.status_code})："
            f"错误码 {response.code} — {response.message}"
        )

    content = response.output.choices[0].message.content
    if isinstance(content, list):
        text = content[0]["text"]
    else:
        text = content

    print(f"[API] 模型返回长度: {len(text)} 字符")
    print(f"[API] 返回前300字: {text[:300]}")
    return text


def extract_json(text):
    text = text.strip()
    # 去掉可能的 markdown 代码块
    text = re.sub(r"```(?:json)?\s*\n?", "", text)
    text = re.sub(r"```\s*", "", text)

    # 尝试直接解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 尝试提取最外层 JSON
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"无法从模型回复中提取 JSON，原始回复前500字：{text[:500]}")


# ---- routes ----

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

        # 判断图片来源：base64 或文件路径
        if image_source.startswith("data:") or (
            len(image_source) > 200 and "/" not in image_source[:20]
        ):
            tmp_path = save_base64_image(image_source)
            image_path = tmp_path
        elif os.path.isfile(image_source):
            image_path = image_source
        else:
            return (
                jsonify(
                    {
                        "success": False,
                        "error": f"无效的图片数据或文件不存在：{image_source[:80]}...",
                    }
                ),
                400,
            )

        raw_text = call_qwen_vision(image_path, mappings, model)
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


def _persist():
    save_config({
        "api_key": _api_key,
        "model": current_model,
        "mappings": current_mappings,
    })


@app.route("/api/key", methods=["GET", "POST"])
def key_handler():
    global _api_key
    if request.method == "POST":
        data = request.json or {}
        new_key = (data.get("api_key") or "").strip()
        _api_key = new_key
        _persist()
        return jsonify({"success": True, "has_key": bool(_api_key)})
    return jsonify({"success": True, "has_key": bool(_api_key)})


@app.route("/api/mappings", methods=["GET", "POST"])
def mappings_handler():
    global current_mappings
    if request.method == "POST":
        data = request.json
        if isinstance(data, dict):
            current_mappings = dict(data)
            _persist()
        return jsonify({"success": True, "mappings": current_mappings})
    return jsonify({"success": True, "mappings": current_mappings})


@app.route("/api/mappings/reset", methods=["POST"])
def reset_mappings():
    global current_mappings
    current_mappings = dict(DEFAULT_MAPPINGS)
    _persist()
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
            _persist()
        return jsonify({"success": True, "model": current_model})
    return jsonify({
        "success": True,
        "model": current_model,
        "models": AVAILABLE_MODELS,
    })


# ---- startup ----

def open_browser():
    time.sleep(1.2)
    webbrowser.open("http://localhost:5800")


if __name__ == "__main__":
    print("=" * 48)
    print("  工厂尺码表转换工具 v1.0")
    print(f"  模型: {current_model}  |  temperature: {TEMPERATURE}")
    print(f"  打开浏览器: http://localhost:5800")
    print("=" * 48)
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host="0.0.0.0", port=5800, debug=False)
