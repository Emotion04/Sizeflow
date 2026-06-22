"""裤子文案生成模块

复用 vision.py 的 call_qwen() 做 AI 调用。
风格指南由你维护在下方常量中。
"""

import json
import re
from vision import call_qwen

# ======== 常量（你维护的部分）========

STYLE_GUIDE = """
语气轻柔女性化，像朋友聊天推荐，不硬推销不喊口号。
句式：中长句自然流水，逗号连接成分，少用句号。多用否定式表达卖点（不紧绷、不挑腿型、不勒肉）。
高频词：修饰、线条、柔和、松弛、轻松、悄悄、自带、复古、清爽、流畅、利落、温柔。
绝对禁止：感叹号、emoji、极限词（最/第一/顶级等）、"买它""抢购"等强制推销语。
"""

STYLE_EXAMPLES = """
【类型1示例 — 详情页文案】
标题：自带滤镜浅蓝微喇裤
body：清新柔和的水洗蓝调，带着淡淡的复古做旧感，中低腰+微喇的黄金组合，不刻意收腰也能悄悄优化比例，腰腹线条自然收紧，从胯部到裤脚的线条顺滑流畅，悄悄修饰腿型，轻松穿出直溜筷子腿。面料柔软的却很有筋骨，贴肤舒适不闷汗。不管是配小吊带、短款T恤还是温柔针织衫，都能搭出松弛又好看的日常感。

标题：松弛感水洗阔腿牛仔
body：中低腰剪裁修饰胯部更显瘦，复古水洗阔腿牛仔裤，自带阳光晒过的松弛质感。宽松垂顺裤管修饰腿型，对多种身材都很友好，面料柔软透气，夏天穿也不闷不贴腿，搭配吊带、T恤或衬衫都适配，轻松hold住日常、约会、通勤等多种场景，是衣柜里能反复穿的耐看款。

【类型2示例 — 卖点文案】
（首行：颜色：怀旧色 面料成分： 弹力指数： 版型类型： 厚度指数：适中 柔软指数：适中）
卖点1 — 中高腰设计：中高腰头+筒喇剪裁，提拉腰线，优化腰臀比例，轻松打造三七分身材
卖点2 — 舒适微弹牛仔面料：面料添加微量弹力纤维，蹲坐、迈步不紧绷，胯部大腿没有束缚感，活动自在
卖点3 — 直筒微喇型剪裁：裤管从膝盖处缓缓放宽，藏肉显瘦不挑腿型，视觉拉长双腿，修身不紧绷
卖点4 — 复古做旧质感：自带复古质感，经过多重水洗工艺打磨出自然的层次感，摆脱沉闷单调的纯色裤子

（首行：颜色：复古蓝 面料成分： 弹力指数： 版型类型： 厚度指数：适中 柔软指数：适中）
卖点1 — 中腰立体剪裁：中腰腰头+修身剪裁，提拉腰线，优化腰臀比例，轻松打造三七分身材
卖点2 — 有弹修身面料：柔软有弹牛仔面料，贴合曲线不紧绷，兼顾舒适穿着感与显瘦效果，不勒肉不压胯
卖点3 — 微喇裤型剪裁：上窄下宽微喇版型，自然修饰腿部线条，视觉拉长双腿，对O型腿、小腿粗友好
卖点4 — 复古磨白做旧感：复古做旧色调，经典百搭轻松搭配，适配通勤、约会等多种场景
"""

BANNED_WORDS = [
    "最", "第一", "顶级", "极致", "唯一", "全网", "首选",
    "全网第一", "销量第一", "No.1", "绝无仅有", "独一无二",
    "100%", "永久的", "终身的", "极品", "无敌",
    "最便宜", "最低价", "全网最低", "全国第一", "第一品牌",
]

WAIST_RULES = {
    (0, 21.99): "低腰",
    (22, 24): "中低腰",
    (25, 28): "中高腰",
    (28.01, 99): "高腰",
}


# ======== System Prompt ========

COPYWRITER_SYSTEM = f"""你是 Sizeflow 电商文案助手，专业为裤子产品撰写商品详情文案。

你必须严格遵守以下准则：
1. 禁止使用违禁词：{', '.join(BANNED_WORDS)} 以及任何类似含义的极限词
2. 每次输出 {{{{count}}}} 个版本（用户指定数量），每个版本从不同角度切入
3. 腰型描述必须严格遵循给定的判定结果，不可编造或混淆
4. 所有卖点必须来源于图片中的可见特征或用户提供的标签，不可凭空想象
5. 每个版本包含两种结构：结构A（标题+主体内容）+ 结构B（具体卖点+具体介绍）
6. 卖点要自然融入文案叙述，不要像质检清单一样逐条罗列
7. 输出格式为严格 JSON，不要 markdown 包裹，不要额外解释"""


# ======== 函数 ========

def determine_waist_type(size_data, raw_text=None):
    """从 OCR 结果中读取"前浪"值，按规则判定腰型。

    Args:
        size_data: dict, {"headers": [...], "rows": [[...], ...]}
        raw_text: str|None, 原始 OCR 转录文本 (pipe-delimited)。
                  优先使用 raw_text，因为它包含所有 AI 识别出的字段（不受 mappings 过滤影响）

    Returns:
        dict: {"waist_type": "中低腰"|"中高腰"|"未知", "front_rise": float|None, "note": str}
    """
    # 优先从 raw_text 中直接查找前浪值（raw 不受 mapping 过滤的影响）
    if raw_text:
        front_rise_from_raw = _extract_front_rise_from_raw(raw_text)
        if front_rise_from_raw is not None:
            return front_rise_from_raw

    # fallback: 从解析后的 headers/rows 中查找
    headers = size_data.get("headers", [])
    rows = size_data.get("rows", [])

    if not headers or not rows:
        return {"waist_type": "未知", "front_rise": None, "note": "尺码数据为空"}

    # 模糊匹配"前浪"列（含"前浪连腰"、"前浪"、"裆深"、"上裆"、"直裆"等变体）
    candidates = ["前浪", "裆深", "上裆", "直裆", "前裆", "股上", "上浪"]
    front_rise_idx = None
    for i, h in enumerate(headers):
        hl = h.replace(" ", "").lower()
        if any(c in hl for c in candidates):
            front_rise_idx = i
            break

    if front_rise_idx is None:
        return {"waist_type": "未知", "front_rise": None,
                "note": f"未找到前浪相关字段，请在映射中添加'前浪连腰'或从下拉框手动选列。可用列: {', '.join(headers[:12])}"}

    # 取第一个尺码对应的前浪值
    first_val = rows[0][front_rise_idx] if front_rise_idx < len(rows[0]) else None

    if first_val is None or first_val == "/" or str(first_val).strip() == "":
        return {"waist_type": "未知", "front_rise": None, "note": "前浪数据为空或缺失"}

    try:
        cm = float(str(first_val).replace("cm", "").replace("CM", "").strip())
    except (ValueError, TypeError):
        return {"waist_type": "未知", "front_rise": str(first_val), "note": f"无法解析前浪数值: {first_val}"}

    return _classify_front_rise(cm)


def _extract_front_rise_from_raw(raw_text):
    """从 raw OCR 转录文本中直接提取前浪值。

    raw_text 格式: "尺码 | 26 | 27 | ...\n腰围（拉平量） | 68 | 72 | ...\n前浪连腰 | 23 | 24 | ..."
    """
    candidates = ["前浪", "裆深", "上裆", "直裆", "前裆", "股上", "上浪"]
    lines = raw_text.strip().split("\n")
    for line in lines:
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 2:
            continue
        name = parts[0]
        if any(c in name for c in candidates):
            # 取第一个数值（对应最小尺码）
            for val in parts[1:]:
                val = val.strip()
                if val and val not in ("/", "?", "？", "-"):
                    try:
                        cm = float(val.replace("cm", "").replace("CM", "").strip())
                        return _classify_front_rise(cm, raw_field=name)
                    except (ValueError, TypeError):
                        continue
            # 所有值都无法解析
            return {"waist_type": "未知", "front_rise": None,
                    "note": f"在 raw 文本中找到'{name}'行但无法解析数值: {parts[1:4]}"}
    # 没找到匹配行
    return None


def _classify_front_rise(cm, raw_field=None):
    """根据前浪数值判定腰型"""
    for (lo, hi), label in WAIST_RULES.items():
        if lo <= cm <= hi:
            note = f"(从'{raw_field}'读取)" if raw_field else ""
            return {"waist_type": label, "front_rise": cm, "note": note}
    return {"waist_type": "未知", "front_rise": cm, "note": f"前浪 {cm}cm 无法分类"}


def validate_copy(text):
    """扫描文案中的 banned words。

    Args:
        text: str, 单段文案文本

    Returns:
        list: [{"word": "最", "context": "最好看的裤子"}, ...]
    """
    hits = []
    for word in BANNED_WORDS:
        idx = text.find(word)
        if idx != -1:
            # 提取上下文（前后各5个字符）
            start = max(0, idx - 5)
            end = min(len(text), idx + len(word) + 5)
            hits.append({"word": word, "context": text[start:end]})
    return hits


def validate_all_copies(copies):
    """对所有版本的全部文案做合规检查。

    Args:
        copies: list of dict, AI 返回的版本列表

    Returns:
        list: 每版本的违禁词命中情况
    """
    results = []
    for copy in copies:
        version_hits = {"version": copy.get("version", "?"), "hits": []}
        for field in ["title_a", "body_a", "title_b"]:
            text = copy.get(field, "")
            version_hits["hits"].extend(validate_copy(text))
        for bullet in copy.get("body_b", []):
            version_hits["hits"].extend(validate_copy(bullet))
        results.append(version_hits)
    return results


def build_copy_prompt(product_image_count, size_data, waist_info, manual_tags, count=3):
    """构建完整的多模态文案生成 prompt。

    Args:
        product_image_count: int, 产品图片张数
        size_data: dict, {"headers": [...], "rows": [[...], ...]}
        waist_info: dict, determine_waist_type() 的返回值
        manual_tags: list, 用户手动补充的卖点标签
        count: int, 生成版本数

    Returns:
        str: 完整的 prompt 文本
    """
    tags_str = ", ".join(manual_tags) if manual_tags else "（无手动标签，请完全从图片中识别）"

    size_summary = ""
    if size_data and size_data.get("headers") and size_data.get("rows"):
        headers = size_data["headers"]
        # 只展示前几行关键数据，避免 prompt 过长
        size_summary = f"""
【尺码数据】
表头：{', '.join(headers)}
数据行数：{len(size_data['rows'])} 个尺码
首行示例：{dict(zip(headers, size_data['rows'][0])) if size_data['rows'] else '无数据'}
"""

    # 动态构建 JSON 示例
    type1_examples = ",\n    ".join([f'{{{{ "type": 1, "version": {i}, {"" if i == 1 else ""}"title_a": "...", "body_a": "..." }}}}' for i in range(1, count + 1)])
    type2_examples = ",\n    ".join([f'{{{{ "type": 2, "version": {i}, {"" if i == 1 else ""}"color": "...", "fabric": "", "elasticity": "", "fit_type": "", "thickness": "适中", "softness": "适中", "items": [{{{{"title": "...", "desc": "..."}}}}] }}}}' for i in range(1, count + 1)])

    prompt = f"""请根据以下信息为这款裤子生成电商文案。

【产品图片】
共提供了 {product_image_count} 张裤子图片（包含正反面、细节图等），请从中识别：
- 裤型（直筒、阔腿、锥形、紧身、微喇等）
- 腰型设计（注意：用户已提供腰型判定结果，请直接使用，不要从图片重新判断）
- 细节元素（刺绣、破洞、猫须、磨白、水洗、铆钉、拉链、口袋设计等）
- 面料质感（牛仔、棉麻、灯芯绒、针织等）
- 颜色与水洗效果
{size_summary}
【腰型判定】
前浪值：{waist_info.get('front_rise', '未知')}cm
判定结果：{waist_info.get('waist_type', '未知')}
{waist_info.get('note', '')}
**请在文案中严格使用以上腰型判定结果，不要编造或更改。**

【用户补充卖点标签】
{tags_str}
注意：以上标签是产品确实有的特征，请在文案中自然融入，不要逐条罗列。

【风格指南 — 调性】
{STYLE_GUIDE}

【风格指南 — 示例参考】
{STYLE_EXAMPLES}

【输出要求】
生成 2 种不同类型的文案，每种各 {{count}} 个版本（共 {{total}} 个版本）：

类型1 — 详情页文案：
  每个版本：title_a（标题6-12字）+ body_a（120-180字流水式叙述）
  结构：颜色/水洗 → 腰型/版型 → 上身效果 → 面料质感 → 搭配建议 → 氛围收尾
  禁止感叹号、emoji、极限词

类型2 — 卖点文案：
  每个版本首行：color（AI从图片识别） + fabric（留空） + elasticity（留空） + fit_type（留空） + thickness（固定"适中"） + softness（固定"适中"）
  然后 4 个卖点，每个卖点 = title（6-10字）+ desc（25-40字）
  四个卖点按：腰型设计 → 面料 → 裤型剪裁 → 颜色/做旧/细节
  句式自然，否定式表达（不紧绷、不挑腿型），禁止感叹号、emoji

【违禁词检查】
输出前逐条自检，严禁包含以下词语：{', '.join(BANNED_WORDS)}

【输出格式】
严格输出 JSON（不要 markdown 代码块）：
{{ "copies": [
    {type1_examples},
    {type2_examples}
  ]
}}"""
    return prompt.replace("{{count}}", str(count)).replace("{{total}}", str(count * 2))


def parse_copy_json(raw_text):
    """从 AI 返回文本中提取 JSON，兼容各种异常格式。

    Args:
        raw_text: str, AI 原始输出

    Returns:
        dict: 解析后的文案数据，失败时返回 {"copies": [], "parse_error": "..."}
    """
    text = raw_text.strip()

    # 去除 markdown 代码块包裹
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    # 尝试直接解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 尝试提取第一个 { 到最后一个 } 之间的内容
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        return json.loads(text[start:end])
    except (ValueError, json.JSONDecodeError):
        pass

    # 兜底：返回错误
    return {"copies": [], "parse_error": f"无法解析 AI 返回的 JSON。原始文本前 200 字: {raw_text[:200]}"}


def generate_pants_copy(product_image_paths, size_data, waist_type_override,
                        model="qwen3-vl-plus", manual_tags=None, count=3):
    """主入口：构建消息 → 调用 AI → 解析结果 → 合规检查 → 返回结构化文案。

    Args:
        product_image_paths: list[str], 产品图片本地路径列表
        size_data: dict, {"headers": [...], "rows": [[...], ...]}
        waist_type_override: str|None, 用户手动覆盖的腰型（None=自动判定）
        model: str, AI 模型 ID
        manual_tags: list[str]|None, 手动补充的卖点标签
        count: int, 生成版本数（1-5）

    Returns:
        dict: {"copies": [...], "compliance": [...], "raw_text": "..."}
    """
    if manual_tags is None:
        manual_tags = []

    count = max(1, min(5, count))

    # 1. 腰型判定
    waist_info = determine_waist_type(size_data)
    if waist_type_override:
        waist_info["waist_type"] = waist_type_override
        waist_info["note"] = "(用户手动指定)"

    # 2. 构建 prompt
    prompt = build_copy_prompt(
        product_image_count=len(product_image_paths),
        size_data=size_data,
        waist_info=waist_info,
        manual_tags=manual_tags,
        count=count,
    )

    # 3. 构建多模态消息
    system_msg = COPYWRITER_SYSTEM.replace("{{{{count}}}}", str(count))

    user_content = []
    for img_path in product_image_paths:
        user_content.append({"image": f"file://{img_path}"})
    user_content.append({"text": prompt})

    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_content},
    ]

    # 4. 调用 AI
    raw_text = call_qwen(messages, model=model, temperature=0.8)

    # 5. 解析 JSON
    result = parse_copy_json(raw_text)

    if "parse_error" in result:
        return {"copies": [], "compliance": [], "raw_text": raw_text, "error": result["parse_error"]}

    # 6. 合规检查
    compliance = validate_all_copies(result.get("copies", []))

    return {"copies": result.get("copies", []), "compliance": compliance, "raw_text": raw_text}
