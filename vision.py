"""DashScope Qwen 多模态 API 调用"""

import re
import json
import base64
import tempfile
import dashscope

from config import get_api_key, TEMPERATURE
from prompt import build_ocr_prompt, OCR_SYSTEM_MESSAGE

dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"


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


def call_qwen(messages, model="qwen3-vl-plus", temperature=None):
    """通用 Qwen 多模态调用"""
    if temperature is None:
        temperature = TEMPERATURE

    response = dashscope.MultiModalConversation.call(
        api_key=get_api_key(),
        model=model,
        messages=messages,
        temperature=temperature,
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

    return text


def call_ocr_vision(image_path, mappings, model):
    """OCR 尺码表识别"""
    prompt = build_ocr_prompt(mappings)
    messages = [
        {
            "role": "system",
            "content": [{"text": OCR_SYSTEM_MESSAGE}],
        },
        {
            "role": "user",
            "content": [
                {"image": f"file://{image_path}"},
                {"text": prompt},
            ],
        }
    ]

    print(f"[API-OCR] model={model}, temp={TEMPERATURE}, path={image_path}")
    text = call_qwen(messages, model=model)
    print(f"[API-OCR] result len={len(text)}, preview={text[:300]}")
    return text


def extract_json(text):
    text = text.strip()
    text = re.sub(r"```(?:json)?\s*\n?", "", text)
    text = re.sub(r"```\s*", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"无法从模型回复中提取 JSON，原始回复前500字：{text[:500]}")
