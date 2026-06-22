"""DashScope Qwen 多模态 API 调用 —— AI纯转录，服务器端映射"""

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


def call_qwen(messages, model="qwen3-vl-plus", temperature=None, usage_out=None):
    """通用 Qwen 多模态调用。usage_out 可选 dict，调用后 usage_out['data'] = {input_tokens, output_tokens, total_tokens}"""
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

    if usage_out is not None and hasattr(response, 'usage') and response.usage:
        u = response.usage
        usage_out["data"] = {"input_tokens": u.input_tokens or 0, "output_tokens": u.output_tokens or 0, "total_tokens": u.total_tokens or u.input_tokens + u.output_tokens}

    content = response.output.choices[0].message.content
    if isinstance(content, list):
        text = content[0]["text"]
    else:
        text = content

    return text


def call_qwen_stream(messages, model="qwen3-vl-plus", temperature=None, usage_out=None):
    """Qwen 流式调用，逐 token yield。usage_out 可选 dict，调用后 usage_out['data'] = {input_tokens, output_tokens, total_tokens}"""
    if temperature is None:
        temperature = TEMPERATURE

    responses = dashscope.MultiModalConversation.call(
        api_key=get_api_key(),
        model=model,
        messages=messages,
        temperature=temperature,
        top_p=0.01,
        stream=True,
    )

    last_response = None
    for response in responses:
        last_response = response
        if response.status_code != 200:
            raise Exception(
                f"API 调用失败 (HTTP {response.status_code})："
                f"错误码 {response.code} — {response.message}"
            )
        if response.output and response.output.choices:
            content = response.output.choices[0].message.content
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and "text" in item:
                        yield item["text"]
                    elif isinstance(item, str):
                        yield item
            elif isinstance(content, str):
                yield content

    if usage_out is not None and last_response and hasattr(last_response, 'usage') and last_response.usage:
        u = last_response.usage
        usage_out["data"] = {"input_tokens": u.input_tokens or 0, "output_tokens": u.output_tokens or 0, "total_tokens": u.total_tokens or u.input_tokens + u.output_tokens}


def call_ocr_vision(image_path, mappings, model):
    """AI 只做纯转录，返回原始文本"""
    prompt = """逐行抄写图片中最上方那张尺码表的数据。表格上方可能有合并单元格的标题行，跳过标题行，只抄表格内容。
严格忽略下方任何附属表格（洗前、洗后、成衣等副表一概不要）。

输出格式（每行用"|"分隔，第一行必须是尺码代号）：
尺码 | 26 | 27 | 28 | 29 | 30
腰围 | 68 | 72 | 76 | 80 | 84
座围 | 94 | 98 | 102 | 106 | 110
外长连腰A | 98 | 99 | 100 | 101 | 102
...

规则：
- 第一行必须是尺码代号（如26/27/28或S/M/L），以"尺码 |"开头
- 部位名称原样抄写（包括括号、字母等，不要省略）
- 数值原样抄写，不要增减小数点
- 看不清填"?"
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

    print(f"[OCR-转录] model={model}")
    usage_out = {}
    text = call_qwen(messages, model=model, usage_out=usage_out)
    print(f"[OCR-转录] result:\n{text[:600]}")
    return text, usage_out.get("data")


def _normalize_name(s):
    """标准化工厂名称，返回多个候选名以支持模糊匹配"""
    s = s.replace("（", "(").replace("）", ")")
    s = re.sub(r"\s+", "", s)
    candidates = [s]
    # 策略A：只去括号保留内容 "外长连腰(C)" → "外长连腰C"
    bare = s.replace("(", "").replace(")", "")
    if bare != s:
        candidates.append(bare)
    # 策略B：去括号及内容 "腰围（拉平量）" → "腰围"
    stripped = re.sub(r"\([^)]*\)", "", s)
    if stripped and stripped != s and stripped not in candidates:
        candidates.append(stripped)
    return candidates


def parse_transcription(text, mappings):
    """服务器端解析转录文本，确定性匹配工厂名称 → 输出JSON"""
    lines = text.strip().split("\n")
    factory_rows = {}  # factory_name → [values]
    size_codes = []

    # 建立映射表的标准化查找：候选名 → (original_key, output_name)
    norm_map = {}
    for fk, ov in mappings.items():
        for nk in _normalize_name(fk):
            norm_map[nk] = (fk, ov)

    for line in lines:
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 2:
            continue
        name, values = parts[0], parts[1:]
        # 尝试所有候选名匹配
        matched = False
        for nn in _normalize_name(name):
            if nn == "尺码":
                size_codes = values
                matched = True
                break
            if nn in norm_map:
                orig_key, _ = norm_map[nn]
                factory_rows[orig_key] = values
                matched = True
                break
        # 兜底：规范化后子串匹配（如"腰围拉平量"包含"腰围"）
        if not matched and name != "尺码":
            for nn in _normalize_name(name):
                if matched:
                    break
                for nk, (orig_key, _) in norm_map.items():
                    if nk in nn or nn in nk:
                        factory_rows[orig_key] = values
                        matched = True
                        break
        if not matched and name != "尺码":
            factory_rows[name] = values

    if not size_codes:
        print("[parse] WARNING: 未找到尺码行，尝试从其他行推断")
        # 取最长的一行值作为尺码
        if factory_rows:
            longest = max(factory_rows.values(), key=len)
            size_codes = longest

    # 构建输出
    output_headers = get_output_headers(mappings)
    headers = ["尺码"] + [h for h in output_headers]
    print(f"[parse] 输出表头: {headers}")
    print(f"[parse] 找到工厂行: {list(factory_rows.keys())}")

    # 对齐：数据行可能比尺码行多出前导列（如公差列），自动切除
    num_sizes = len(size_codes)
    aligned_rows = {}  # factory_name → trimmed values
    for fname, vals in factory_rows.items():
        if len(vals) > num_sizes:
            trim = len(vals) - num_sizes
            aligned_rows[fname] = vals[trim:]
            print(f"[parse] 对齐切除: {fname} 前{trim}列 → {aligned_rows[fname]}")
        else:
            aligned_rows[fname] = vals

    # 找到实际存在数据的列索引，按顺序排列
    present_cols = {}  # output_name → factory_name
    for fname, oname in mappings.items():
        if fname in factory_rows:
            present_cols[oname] = fname

    # 为每个尺码构建一行
    rows = []
    for si in range(num_sizes):
        row = [size_codes[si] if si < len(size_codes) else "/"]
        for oname in output_headers:
            if oname in present_cols:
                fname = present_cols[oname]
                vals = aligned_rows.get(fname, factory_rows[fname])
                row.append(vals[si] if si < len(vals) and vals[si] not in ("", "?", "？") else "/")
            else:
                row.append("/")
        rows.append(row)

    # 清理尺码列 .00 后缀
    for row in rows:
        try:
            n = float(row[0])
            if n == int(n):
                row[0] = str(int(n))
        except (ValueError, TypeError):
            pass

    print(f"[parse] 实际数据列: {list(present_cols.keys())}")
    print(f"[parse] 缺失列(填/): {[h for h in output_headers if h not in present_cols]}")
    print(f"[parse] 首行: {rows[0] if rows else 'N/A'}")

    return {"headers": headers, "rows": rows}


def format_numbers(data):
    """清理数值格式：整数去掉小数点，小数保留一位（跳过第一列尺码）"""
    for row in data.get("rows", []):
        for i, cell in enumerate(row):
            if i == 0 or cell is None or not isinstance(cell, str) or cell == "/":
                continue
            try:
                num = float(cell)
                if num == int(num):
                    row[i] = str(int(num))
                else:
                    row[i] = f"{num:.1f}"
            except (ValueError, TypeError):
                pass


def extract_json(text):
    """extract_json 保留兼容旧路径，新流程不使用"""
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
