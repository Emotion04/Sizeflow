"""DashScope Qwen 多模态 API 调用 — 两步式：先转录再映射"""

import re
import json
import base64
import tempfile
import dashscope

from config import get_api_key, TEMPERATURE, get_output_headers

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


def call_transcribe_image(image_path, model):
    """第一步：看图纯转录（不涉及映射），返回原始抄写文本"""
    prompt = """你是一台精确的表格转录机器。请逐行抄写图片中最上方的主尺码表。

图片中是一张服装尺码表。表格结构：最左侧列是"部位名称"，顶部行是"尺码代号"。
严格忽略下方的"洗前尺寸表"、"洗后尺寸表"、"成衣尺寸表"等任何副表，只读最上方的主表。

每行格式：部位名称 | 数值1 | 数值2 | 数值3 | ...

例如：
  腰围 | 68 | 72 | 76 | 80 | 84
  座围 | 94 | 98 | 102 | 106 | 110
  外长连腰A | 98 | 99 | 100 | 101 | 102

规则：
- 只抄最上方的主尺码表
- 数值原样抄写，不要增减小数点
- 看不清用"?"
- 只输出抄写文本，不要JSON，不要解释"""

    messages = [
        {
            "role": "user",
            "content": [
                {"image": f"file://{image_path}"},
                {"text": prompt},
            ],
        }
    ]

    print(f"[STEP1-转录] model={model}, path={image_path}")
    text = call_qwen(messages, model=model)
    print(f"[STEP1-转录] len={len(text)}, preview={text[:400]}")
    return text


def call_map_transcription(transcription, mappings):
    """第二步：纯文本映射（不看图），将抄写文本转为结构化 JSON"""
    factory_keys = list(mappings.keys())
    mapping_lines = "\n".join([f'  "{k}" → "{v}"' for k, v in mappings.items()])
    keys_list = "、".join([f'"{k}"' for k in factory_keys])
    output_headers = get_output_headers(mappings)
    headers_str = ", ".join(['"尺码"'] + [f'"{h}"' for h in output_headers])

    prompt = f"""以下是一张服装尺码表的逐行抄写文本：

```
{transcription}
```

请从抄写文本中，找出与以下工厂名称匹配的行：
{keys_list}

按映射关系重命名：
{mapping_lines}

输出严格JSON（不要markdown标记）：
{{"headers":[{headers_str}],"rows":[["26","68","94","52","50","98","102"],...]}}

规则：
- headers 必须包含上述全部字段，顺序一致，一个不能少
- 对于每个映射字段，去抄写文本中查找对应工厂名称：
  * 找到了 → 填入数值
  * 找不到 → 整列填 null
- 绝！不！能！用其他行的数据来填充缺失列
- 绝！不！能！自己编造数字
- rows 第一项是尺码代号，后面依次对应每个 header 的数值
- 数值用字符串类型
- 只输出JSON"""

    messages = [
        {
            "role": "user",
            "content": [{"text": prompt}],
        }
    ]

    print(f"[STEP2-映射] factory keys: {factory_keys}")
    # Use text-only model for mapping (no vision needed)
    text = call_qwen(messages, model="qwen3.5-flash")
    print(f"[STEP2-映射] len={len(text)}, preview={text[:400]}")
    return text


def call_ocr_vision(image_path, mappings, model):
    """两步式 OCR：先转录后映射，杜绝视觉数据串扰"""
    # 第一步：看图转录
    transcription = call_transcribe_image(image_path, model)

    # 第二步：纯文本映射（不看图，只看转录文字）
    result_text = call_map_transcription(transcription, mappings)

    return result_text


def format_numbers(data):
    """清理数值格式：整数去掉小数点，小数保留一位"""
    for row in data.get("rows", []):
        for i, cell in enumerate(row):
            if cell is not None and isinstance(cell, str):
                try:
                    num = float(cell)
                    if num == int(num):
                        row[i] = str(int(num))
                    else:
                        row[i] = f"{num:.1f}"
                except (ValueError, TypeError):
                    pass


def normalize_headers(result, mappings):
    """补全缺失的映射列，填 '/' 示意无数据"""
    expected = get_output_headers(mappings)
    headers = [str(h).strip() for h in result.get("headers", [])]
    rows = result.get("rows", [])

    print(f"[normalize] AI headers: {headers}")
    print(f"[normalize] expected  : {expected}")

    if not headers:
        return result

    # 剥离可能的前缀"尺码"（AI可能把"尺码"放在第一列）
    data_headers = headers[1:] if headers[0] in ("尺码", "尺码(CM)", "尺码/cm") else headers

    # 新表头：尺码 + 所有映射字段
    new_headers = ["尺码"] + [h for h in expected]
    new_rows = []

    for old_row in rows:
        new_row = ["/"] * len(new_headers)
        # 尺码列
        size_val = old_row[0] if old_row and old_row[0] is not None else "/"
        if headers[0] in ("尺码", "尺码(CM)", "尺码/cm"):
            new_row[0] = str(size_val)
        # 按名称匹配其余列
        for ei, eh in enumerate(expected):
            if eh in data_headers:
                oi = data_headers.index(eh)
                real_oi = oi + 1 if headers[0] in ("尺码", "尺码(CM)", "尺码/cm") else oi
                if real_oi < len(old_row) and old_row[real_oi] is not None and str(old_row[real_oi]).strip() not in ("", "null", "None"):
                    new_row[ei + 1] = str(old_row[real_oi])
        new_rows.append(new_row)

    result["headers"] = new_headers
    result["rows"] = new_rows
    print(f"[normalize] result headers: {new_headers}")
    print(f"[normalize] result row[0] : {new_rows[0] if new_rows else 'N/A'}")
    return result


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
