"""SPI 卖点图生成 — AI 两轮调用 + 文案后置过滤

Round 1 (VL): 照片 → 5 部位特征 manifest（腰型由上游提供，不在此提取）
Round 2 (文本): 上游腰型 + Round1 manifest + 原表 → 6 槽卖点文案 JSON

原则：Round 1 是数据管道（只提取不解释），Round 2 是压缩器（多源→短句）。
"""

import re
import json

from vision import call_qwen


# ======================================================================
# 每槽字数预算（程序侧从 ref-v2.png 1080×1440 框几何反推）
# 模型只看到数字，不知道框在哪；渲染层照旧独立跑
# ======================================================================

PER_SLOT_BUDGETS = {
    1: 18,   # 腰型 — 右上中等框
    2: 8,    # 胯部 — 右中上最小框
    3: 55,   # 版型总述 — 右侧最大框（唯一允许段落级）
    4: 14,   # 裤管版型 — 左侧中部
    5: 16,   # 裤腿线条 — 左下窄框
    6: 18,   # 颜色面料 — 右下
}

SLOT_NAMES = {
    1: "腰型",
    2: "胯部舒适度",
    3: "版型总述",
    4: "裤管版型",
    5: "裤腿线条",
    6: "颜色面料",
}

# ======================================================================
# 槽位风格分析（基于 spi-reference 6 条原案逐槽拆解，用于 Round 2 prompt）
# ======================================================================

SLOT_STYLE_NOTES = {
    1: {
        "pattern": "[腰型分类]设计，腰线[效果动词]",
        "tone": "定义式、权威感",
        "ref_len": 11,
        "note": "第一句定调，简洁有力；效果动词用「上提/贴合/包裹」等具象动作",
    },
    2: {
        "pattern": "胯部[状态描述]",
        "tone": "短断言式，否定式优先（不紧绷→舒适留量）",
        "ref_len": 6,
        "note": "全场最短句，一般为4-8字；用否定式表达舒适（不紧绷/不卡裆/不勒）；也可正向断言（舒适留量/活动自在）",
    },
    3: {
        "pattern": "设计意图→版型特征→穿着效果→修饰感受，因果递进",
        "tone": "叙事式，否定式穿插（减少拖沓/避免臃肿），修饰感收尾",
        "ref_len": 47,
        "note": "唯一可写段落的槽；先讲设计逻辑（根据…需求调整…比例），再讲上身效果（保留…感/减少…感），末句点修饰价值；用逗号连接分句，自然口语节奏，不堆砌",
    },
    4: {
        "pattern": "[版型定义]，[视觉关键词]感",
        "tone": "命名式，XX感（大直筒感/微锥感/松垮感）",
        "ref_len": 9,
        "note": "通常8-12字；前半句命名版型（窄版阔腿/直筒微锥），后半句给视觉关键词+「感」；不展开原因",
    },
    5: {
        "pattern": "[部位][动词]，[效果1]，[效果2]",
        "tone": "效果堆叠式，修饰/拉长/显瘦",
        "ref_len": 15,
        "note": "效果递进：垂顺→修饰→拉长比例；动词用「垂顺/贴合/延伸」；最多3个分句",
    },
    6: {
        "pattern": "[工艺][特征]，[穿着场景][效果]",
        "tone": "对比式，「更」字提升（更自然/更利落/更好搭）",
        "ref_len": 16,
        "note": "前半句讲洗水/面料工艺特征（洗水层次/自然猫须/石磨纹理），后半句讲穿着效果与搭配；「更」字带出升级感",
    },
}

# ======================================================================
# 数字检测正则（后置过滤用）
# ======================================================================

_NUMBER_PATTERN = re.compile(
    r'\d+\s*(?:cm|码|寸|斤|克|尺|公斤|厘米|英寸|毫米|mm|CM)'  # 数字+单位
    r'|(?<!\d)(?<![a-zA-Z])\d{2,}(?![a-zA-Z])',               # 裸 ≥2 位阿拉伯数字（不贴字母）
)


def _has_size_numbers(text: str):
    """返回文本中命中的所有数字片段；无命中返回空列表"""
    return _NUMBER_PATTERN.findall(text)


def _strip_numbers(text: str) -> str:
    """删除文本中的数字片段（兜底用）"""
    cleaned = _NUMBER_PATTERN.sub('', text).strip()
    # 清理残留符号
    cleaned = re.sub(r'\s+', '', cleaned)
    cleaned = cleaned.strip('，。、；：,.;:')
    return cleaned


# ======================================================================
# Round 1: 照片 → 5 部位特征 manifest
# ======================================================================

def build_r1_prompt() -> str:
    """构建第一轮「特征精准捕获」提示词"""
    return """你是牛仔裤特征提取的"数据管道"，不是创意作家。你的唯一任务是客观观察这张裤子照片，输出你**实际看到**的特征。

【硬性规则】
- 只描述你**确实从照片中看到的**视觉证据
- 不确定的地方填"未识别"，严禁猜测、推断、脑补
- 不解释原因、不美化描述、不写任何超出照片的内容
- 每个部位必须输出 evidence（你看到的客观画面）和 class（约束分类）
- 腰型已由上游尺码表数据提供，**本轮不做腰型识别**

【输出格式】严格 JSON，不要 markdown 代码块：

{
  "胯部": {"evidence": "描述胯部区域的视觉特征（褶皱方向、松紧感、留量状态）", "class": "紧身/舒适留量/宽松/未识别", "conf": "high/medium/low"},
  "版型总述": {"evidence": "描述整体裤型轮廓（从腰到脚的整体线条走向、宽松度变化）", "class": "直筒/阔腿/锥形/紧身/微喇/宽腿/未识别", "conf": "high/medium/low"},
  "裤管版型": {"evidence": "描述裤管从膝到脚的具体形态（收窄/放宽/平行/微锥）", "class": "窄版阔腿/大直筒/微锥/萝卜裤/直筒/未识别", "conf": "high/medium/low"},
  "裤腿线条": {"evidence": "描述裤腿的垂坠感与线条表现（自然垂顺/有型挺括/软塌/有褶皱/飘逸）", "class": "垂顺/挺括/软塌/飘逸/未识别", "conf": "high/medium/low"},
  "颜色面料": {"evidence": "描述颜色+洗水工艺+面料纹理（底色、洗水效果位置、猫须/磨白/石磨层次、面料质感）", "class": "具体颜色+洗水类型，如'深蓝石磨猫须'/'浅蓝磨白破洞'/'黑色纯色'", "conf": "high/medium/low"}
}

【conf 判断标准】
- high：照片清晰，该部位特征明确可辨
- medium：照片存在遮挡或角度限制，只能部分判断
- low：照片无法提供该部位的有效信息，填"未识别"

只输出 JSON，不要任何其他文字。"""


def run_round1(image_path: str) -> dict:
    """执行第一轮：调用 qwen3-vl-flash 提取 5 部位特征 manifest。
    返回解析后的 dict，解析失败返回空 dict。
    """
    prompt = build_r1_prompt()
    raw = call_qwen(
        [{"role": "user", "content": [{"image": f"file://{image_path}"}, {"text": prompt}]}],
        model="qwen3-vl-flash",
    )

    # 解析 JSON
    seen = {}
    try:
        # 去除可能的 markdown 包裹
        clean = raw.strip()
        if clean.startswith("```"):
            clean = re.sub(r"^```(?:json)?\s*", "", clean)
            clean = re.sub(r"```\s*$", "", clean)
        seen = json.loads(clean)
    except json.JSONDecodeError:
        # 尝试提取花括号包裹的 JSON
        m = re.search(r'\{[\s\S]*\}', raw)
        if m:
            try:
                seen = json.loads(m.group())
            except json.JSONDecodeError:
                pass

    # 只为 5 个目标部位保留数据
    target_keys = {"胯部", "版型总述", "裤管版型", "裤腿线条", "颜色面料"}
    manifest = {}
    for key in target_keys:
        v = seen.get(key, {})
        if isinstance(v, dict):
            manifest[key] = {
                "evidence": str(v.get("evidence", "未识别")).strip(),
                "class": str(v.get("class", "未识别")).strip(),
                "conf": str(v.get("conf", "low")).strip(),
            }
        else:
            manifest[key] = {"evidence": "未识别", "class": "未识别", "conf": "low"}

    return manifest


# ======================================================================
# Round 2: 多源特征 → 6 槽卖点文案
# ======================================================================

def _format_size_table(size_data: dict) -> str:
    """将原表 {headers, rows} 格式化为紧凑文本，供 Round 2 推理趋势"""
    if not size_data or not size_data.get("headers") or not size_data.get("rows"):
        return "（无尺码数据）"

    headers = size_data["headers"]
    rows = size_data["rows"]

    lines = [" | ".join(headers)]
    for row in rows[:12]:  # 最多展示 12 个尺码，防止 prompt 过长
        lines.append(" | ".join(str(c) for c in row))

    summary = f"共 {len(rows)} 个尺码，表头：{' / '.join(headers)}\n"
    summary += "\n".join(lines)
    return summary


def build_r2_prompt(
    waist_label: str,
    r1_manifest: dict,
    size_data: dict,
) -> str:
    """构建第二轮「多源融合文案生成」提示词"""
    budget_lines = "\n".join(
        f"  slot {k}: ≤{v} 字 — {SLOT_NAMES[k]}" for k, v in PER_SLOT_BUDGETS.items()
    )
    style_lines = "\n".join(
        f"  slot {k}（{SLOT_NAMES[k]}）≤{PER_SLOT_BUDGETS[k]}字：规律={SLOT_STYLE_NOTES[k]['pattern']}，调性={SLOT_STYLE_NOTES[k]['tone']}。{SLOT_STYLE_NOTES[k]['note']}"
        for k in range(1, 7)
    )

    # ===== 构建特征输入 =====
    context_parts = []

    # 上游腰型（铁律：以此为准，无歧义）
    context_parts.append(f"【腰型·上游数据（以此为准，不可改判）】{waist_label}")

    # Round 1 manifest
    r1_lines = []
    for key in ["胯部", "版型总述", "裤管版型", "裤腿线条", "颜色面料"]:
        v = r1_manifest.get(key, {})
        evidence = v.get("evidence", "未识别")
        klass = v.get("class", "未识别")
        conf = v.get("conf", "low")
        r1_lines.append(f"  {key}：class={klass} | evidence={evidence} | 置信度={conf}")
    context_parts.append("【照片识别特征·AI从真实裤照提取】\n" + "\n".join(r1_lines))

    # 原表
    table_text = _format_size_table(size_data)
    context_parts.append(f"【尺码表原数据·仅用于判断版型趋势/弹力/厚薄/裤长类别，严禁转述数值】\n{table_text}")

    ctx_block = "\n\n".join(context_parts)

    # ===== 组装完整 prompt =====
    prompt = f"""{ctx_block}

【铁律·不可违反】
A. 你只能"描述特征"，不能"引用数据"。输出中严禁出现任何阿拉伯数字、cm/码/寸/斤、具体尺码编号、具体围度数值。
   尺码表仅供你判断"版型偏紧偏松、弹力、厚薄、裤长类别"等趋势，严禁转述表中任何数字。
   违反本条整轮重生成。
B. 严禁照抄引用示例中的原句或仅做微调。必须基于本产品输入特征重新组织语言。
   若某部位输入特征不足以写出合理文案，宁可写短，不得用示例原句填充。
C. 每条严格不超过字数上限；过短也合理（特别是 slot 2 通常仅 4-8 字），不要强行凑字。

【全局风格】
- 手写笔记短句调性（不是电商文案、不是详情页长段、不是说明文）
- 否定式表达优先：不紧绷、不挑腿型、不拖沓、不显胯、不卡裆、不挑人
- 无感叹号、无 emoji、无语助词泛滥
- 句式自然，不堆砌形容词，每句独立成意

【各槽字数上限与风格指引】
{budget_lines}

【各槽写作规律（逐槽）】
{style_lines}

【示例骨架（仅示范格式与字数密度，内容请根据本产品特征重写）】
[
  {{"slot": 1, "text": "≤18字，腰型→设计+效果"}},
  {{"slot": 2, "text": "≤8字，胯部→短断言"}},
  {{"slot": 3, "text": "≤55字，版型→设计意图+特征+效果+修饰"}},
  {{"slot": 4, "text": "≤14字，裤管→版型定义+XX感"}},
  {{"slot": 5, "text": "≤16字，裤腿→垂顺+修饰+拉长"}},
  {{"slot": 6, "text": "≤18字，面料→洗水工艺+穿着效果"}}
]

【输出格式】
严格输出 JSON 数组（不要 markdown 代码块，不要前后缀文字），按 slot 1-6 顺序：

[
  {{"slot": 1, "text": "..."}},
  {{"slot": 2, "text": "..."}},
  {{"slot": 3, "text": "..."}},
  {{"slot": 4, "text": "..."}},
  {{"slot": 5, "text": "..."}},
  {{"slot": 6, "text": "..."}}
]"""

    return prompt


def _parse_r2_output(raw: str):
    """解析 Round 2 输出的 JSON 数组，返回 [{slot, text}] 或 None"""
    text = raw.strip()

    # 去除 markdown 代码块
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"```\s*$", "", text)
    text = text.strip()

    # 尝试直接解析
    try:
        data = json.loads(text)
        if isinstance(data, list) and all(isinstance(item, dict) and "slot" in item for item in data):
            return data
    except json.JSONDecodeError:
        pass

    # 尝试提取 [ 到 ] 之间的内容
    m = re.search(r'\[[\s\S]*\]', text)
    if m:
        try:
            data = json.loads(m.group())
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass

    return None


def run_round2_with_retry(
    r1_manifest: dict,
    size_data: dict,
    waist_label: str,
    model: str = "qwen3.7-plus",
    max_retries: int = 3,
) -> dict:
    """执行第二轮文案生成：调文本模型 → 数字检测 → ≤3 次重试 → 兜底删数字。
    返回 {"selling_points": [{"text":...}*6], "raw": str, "retries": int, "leaks_cleaned": bool}
    """
    prompt = build_r2_prompt(waist_label, r1_manifest, size_data)
    all_raw = ""

    for attempt in range(max_retries + 1):
        raw = call_qwen(prompt, model=model)
        all_raw += f"\n--- attempt {attempt} ---\n{raw}"

        parsed = _parse_r2_output(raw)
        if not parsed:
            # 解析失败也重试
            if attempt < max_retries:
                prompt += f"\n\n[解析失败] 上次输出不是合法 JSON 数组，请严格按格式输出。"
            continue

        # 按 slot 1-6 收集
        slot_map = {}
        for item in parsed:
            s = item.get("slot")
            t = item.get("text", "").strip()
            if isinstance(s, int) and 1 <= s <= 6:
                slot_map[s] = t

        # 检测数字泄漏
        leaks = {}
        for s in range(1, 7):
            text = slot_map.get(s, "")
            nums = _has_size_numbers(text)
            if nums:
                leaks[s] = nums

        if not leaks:
            # 全部干净，成功
            points = [_make_point(s, slot_map.get(s, "")) for s in range(1, 7)]
            return {"selling_points": points, "raw": all_raw, "retries": attempt, "leaks_cleaned": False}

        # 有泄漏
        if attempt < max_retries:
            leak_desc = "；".join(
                f"slot {s}：含禁用数字 {', '.join(nums)}" for s, nums in leaks.items()
            )
            prompt += (
                f"\n\n[重试原因·第{attempt+1}次] 上次输出含禁用数字——{leak_desc}。"
                f"\n请将相关槽改为纯特征描述，严禁保留任何阿拉伯数字。"
            )
        else:
            # 最后一次：自动删数字兜底
            for s in range(1, 7):
                text = slot_map.get(s, "")
                if s in leaks:
                    cleaned = _strip_numbers(text)
                    slot_map[s] = cleaned if len(cleaned) >= 3 else ""
            points = [_make_point(s, slot_map.get(s, "")) for s in range(1, 7)]
            return {"selling_points": points, "raw": all_raw, "retries": attempt, "leaks_cleaned": True}

    # 完全解析失败的兜底
    return {"selling_points": _fallback_points(), "raw": all_raw, "retries": max_retries, "leaks_cleaned": False}


def _make_point(slot: int, text: str) -> dict:
    """构造单个卖点条目"""
    return {"text": text.strip() if text else ""}


def _fallback_points() -> list:
    """AI 完全失败时的硬编码兜底文案"""
    return [
        {"text": "中高腰设计，腰线自然上提"},
        {"text": "胯部舒适留量"},
        {"text": "根据日常需求调整版型比例"},
        {"text": "窄版阔腿，大直筒感"},
        {"text": "裤腿自然垂顺，拉长比例"},
        {"text": "洗水层次自然，日常好搭"},
    ]


# ======================================================================
# 顶层编排：替代 server.py 中的 _spi_analyze_pants
# ======================================================================

def analyze_and_generate(
    image_path: str,
    size_data: dict,
    waist_label: str,
    model: str = "qwen3.7-plus",
) -> dict:
    """完整两轮流程：Round 1 照片特征提取 → Round 2 文案生成（含重试过滤）。
    返回 {"selling_points": [...], "debug": {"r1_prompt", "r1_raw", "r1_manifest", "r2_prompt", "r2_raw", "retries", "leaks_cleaned"}}
    """
    r1_debug = {}

    # Round 1
    r1_prompt = build_r1_prompt()
    r1_manifest = run_round1(image_path)
    r1_raw = json.dumps(r1_manifest, ensure_ascii=False, indent=2)

    r1_debug["r1_prompt"] = r1_prompt
    r1_debug["r1_raw"] = r1_raw
    r1_debug["r1_manifest"] = r1_manifest

    # Round 2
    r2_result = run_round2_with_retry(r1_manifest, size_data, waist_label, model)

    return {
        "selling_points": r2_result["selling_points"],
        "r1_prompt": r1_prompt,
        "r1_raw": r1_raw,
        "r1_manifest": r1_manifest,
        "retries": r2_result["retries"],
        "leaks_cleaned": r2_result["leaks_cleaned"],
        "r2_raw": r2_result["raw"],
    }
