"""全局配置、持久化、字段映射、模型管理"""

import os
import sys
import json
from dotenv import load_dotenv

# ---- 路径 & 环境变量 ----
APP_VERSION = "1.6.1"
if getattr(sys, 'frozen', False):
    APP_DIR = os.path.dirname(sys.executable)
    env_path = os.path.join(APP_DIR, '.env')    
    load_dotenv(env_path)
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))
    load_dotenv()

CONFIG_FILE = os.path.join(APP_DIR, "config.json")

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

# ---- API Key（界面输入 > 配置文件 > .env） ----
_api_key = _config.get("api_key", "") or os.getenv("DASHSCOPE_API_KEY", "")

def get_api_key():
    if not _api_key:
        raise ValueError("未配置 API Key，请在页面右上角输入 DashScope API Key")
    return _api_key

def set_api_key(key):
    global _api_key
    _api_key = key.strip() if key else ""

# ---- 模型配置 ----
AVAILABLE_MODELS = [
    {"id": "qwen3-vl-flash",  "name": "Qwen3-VL Flash",  "desc": "【推荐】视觉快速版"},
    {"id": "qwen3.6-flash",   "name": "Qwen3.6 Flash",   "desc": "最新最速，表格识别精准"},
    {"id": "qwen3.6-plus",    "name": "Qwen3.6 Plus",    "desc": "【屡次错误使用】最新最强，复杂表格推荐"},
    
    {"id": "qwen3-vl-plus",   "name": "Qwen3-VL Plus",   "desc": "视觉增强版"},
    {"id": "qwen3.5-flash",    "name": "Qwen3.5 flash",    "desc": "更快速"},

]

current_model = _config.get("model") or os.getenv("QWEN_MODEL", "qwen3-vl-flash")
TEMPERATURE = float(os.getenv("QWEN_TEMPERATURE", "0.0"))

# ---- 字段映射 ----
DEFAULT_MAPPINGS = {
    "腰围（拉平量）": "腰围",
    "脚围": "脚围",
    "座围": "臀围",
    "脾围": "大腿围",
    "外长连腰C": "常规裤长",
    "外长连腰A": "加长裤长",
    "外长连腰B": "高个子裤长",
    "外长连腰D": "小个子裤长",
}

current_mappings = _config.get("mappings") or dict(DEFAULT_MAPPINGS)


def get_output_headers(mappings=None):
    """从映射值中提取输出表头（去重保序）"""
    if mappings is None:
        mappings = current_mappings
    return list(dict.fromkeys(mappings.values()))

# ---- 持久化合并 ----
def persist():
    save_config({
        "model": current_model,
        "mappings": current_mappings,
    })
