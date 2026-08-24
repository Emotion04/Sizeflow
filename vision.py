"""DashScope Qwen 多模态 API 调用 —— AI纯转录，服务器端映射"""

import re
import json
import base64
import tempfile
import traceback
import requests
import dashscope

from config import get_api_key, TEMPERATURE, get_output_headers

dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

# ---- 超时与重试 ----
# dashscope 的 request_timeout 会原样透传给 requests 的 timeout 参数；
# requests 接受 (connect, read) 元组 → 连接/读取超时分离：
#   connect=10s 快速失败国际链路握手超时；read=300s 给足 OCR/生图时间，不切断进行中的生成。
CONNECT_TIMEOUT = 10
READ_TIMEOUT = 300
CONNECT_RETRIES = 1  # 仅连接建立阶段超时自动重试次数（读取超时不重试）


def _friendly_error(e):
    """面向用户的中文提示 + 源错误（换行附带），方便用户截图反馈排错"""
    raw = f"{type(e).__name__}: {e}"
    if isinstance(e, requests.exceptions.ConnectTimeout):
        return f"连接 AI 服务器超时（已自动重试，仍失败），请检查网络后重试。\n源错误: {raw}"
    if isinstance(e, requests.exceptions.ReadTimeout):
        return f"AI 响应超时（生成时间过长），请重试。\n源错误: {raw}"
    if isinstance(e, requests.exceptions.ConnectionError):
        return f"无法连接 AI 服务器（网络错误），请检查网络后重试。\n源错误: {raw}"
    return str(e)


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


def _extract_usage(response, usage_out):
    """共享 usage 提取：MultiModal / Generation response → usage_out['data']"""
    if usage_out is not None and hasattr(response, 'usage') and response.usage:
        u = response.usage
        usage_out["data"] = {
            "input_tokens": u.input_tokens or 0,
            "output_tokens": u.output_tokens or 0,
            "total_tokens": u.total_tokens or (u.input_tokens or 0) + (u.output_tokens or 0),
        }


def call_qwen(messages, model="qwen3-vl-plus", temperature=None, usage_out=None, retry_info=None):
    """通用调用（图片+文本 或 纯文本）。
    messages 可以是多模态格式列表，或纯文本字符串（自动包装）。
    不传 temperature / top_p，走模型默认参数。
    新增：连接建立阶段超时自动重试 1 次；retry_info(可选 dict) 重试后置 retry_info['retried']=True。
    网络异常翻译为中文（原始异常仍 traceback 保留日志）。"""

    # 纯文本字符串 → 自动包装为多模态消息格式
    if isinstance(messages, str):
        messages = [{"role": "user", "content": [{"text": messages}]}]

    kwargs = {"api_key": get_api_key(), "model": model, "messages": messages,
              "request_timeout": (CONNECT_TIMEOUT, READ_TIMEOUT)}
    if temperature is not None:
        kwargs["temperature"] = temperature
    # 注意：不传 top_p，走模型默认（避免限制输出多样性）

    try:
        response = dashscope.MultiModalConversation.call(**kwargs)
    except requests.exceptions.ConnectTimeout as e:
        # ConnectTimeout 是 ConnectionError 的子类，必须先捕获
        traceback.print_exc()
        print(f"[call_qwen] 连接超时(phase=connect)，自动重试: {type(e).__name__}: {e}")
        if retry_info is not None:
            retry_info["retried"] = True
        try:
            response = dashscope.MultiModalConversation.call(**kwargs)
        except requests.exceptions.ConnectTimeout as e2:
            traceback.print_exc()
            print(f"[call_qwen] 重试后仍连接超时，放弃: {type(e2).__name__}: {e2}")
            raise Exception(_friendly_error(e2))
    except requests.exceptions.ConnectionError as e:
        # 非超时连接失败（DNS/拒连/SSL）——不重试，仅翻译
        traceback.print_exc()
        print(f"[call_qwen] 连接失败(phase=connect，非超时不重试): {type(e).__name__}: {e}")
        raise Exception(_friendly_error(e))
    except requests.exceptions.ReadTimeout as e:
        traceback.print_exc()
        print(f"[call_qwen] 读取超时(phase=read，不重试): {type(e).__name__}: {e}")
        raise Exception(_friendly_error(e))

    if response.status_code != 200:
        raise Exception(
            f"API 调用失败 (HTTP {response.status_code})："
            f"错误码 {response.code} — {response.message}"
        )

    _extract_usage(response, usage_out)

    content = response.output.choices[0].message.content
    if isinstance(content, list):
        # 多模态响应 content 是 list[dict]，取第一个 text
        first = content[0]
        return first["text"] if isinstance(first, dict) else str(first)
    return content


def call_qwen_stream(messages, model="qwen3-vl-plus", temperature=None, usage_out=None, retry_info=None):
    """Qwen 流式调用，逐 token yield。usage_out 可选 dict，调用后 usage_out['data'] = {input_tokens, output_tokens, total_tokens}
    新增：首个 token 到达前连接超时自动重试 1 次；已产出 token 后的断流/读取超时一律不重试（避免重复流式内容）。
    注意：generator 的网络请求在首次迭代时才发起，重试必须包在迭代循环外。"""
    if temperature is None:
        temperature = TEMPERATURE

    def _request():
        return dashscope.MultiModalConversation.call(
            api_key=get_api_key(),
            model=model,
            messages=messages,
            temperature=temperature,
            top_p=0.01,
            stream=True,
            request_timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
        )

    attempt = 0
    emitted = False
    last_response = None
    responses = None
    while True:
        try:
            if responses is None:
                responses = _request()
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
                                emitted = True
                                yield item["text"]
                            elif isinstance(item, str):
                                emitted = True
                                yield item
                    elif isinstance(content, str):
                        emitted = True
                        yield content
            break
        except requests.exceptions.ConnectTimeout as e:
            if attempt >= CONNECT_RETRIES or emitted:
                traceback.print_exc()
                print(f"[call_qwen_stream] 连接超时不再重试(attempt={attempt}, emitted={emitted}): {type(e).__name__}: {e}")
                raise Exception(_friendly_error(e))
            attempt += 1
            traceback.print_exc()
            print(f"[call_qwen_stream] 连接超时(phase=connect)，自动重试 {attempt}/{CONNECT_RETRIES}: {type(e).__name__}: {e}")
            if retry_info is not None:
                retry_info["retried"] = True
            responses = None
        except requests.exceptions.ConnectionError as e:
            # 中途断流（如 ChunkedEncodingError，也是 ConnectionError）→ 不重试，仅翻译
            traceback.print_exc()
            print(f"[call_qwen_stream] 连接失败(phase=connect，非超时不重试): {type(e).__name__}: {e}")
            raise Exception(_friendly_error(e))
        except requests.exceptions.ReadTimeout as e:
            traceback.print_exc()
            print(f"[call_qwen_stream] 读取超时(phase=read，不重试): {type(e).__name__}: {e}")
            raise Exception(_friendly_error(e))

    if usage_out is not None and last_response and hasattr(last_response, 'usage') and last_response.usage:
        u = last_response.usage
        usage_out["data"] = {"input_tokens": u.input_tokens or 0, "output_tokens": u.output_tokens or 0, "total_tokens": u.total_tokens or u.input_tokens + u.output_tokens}


def call_ocr_vision(image_path, mappings, model, retry_info=None):
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
    text = call_qwen(messages, model=model, usage_out=usage_out, retry_info=retry_info)
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
