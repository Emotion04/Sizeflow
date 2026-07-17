"""AI 尺码表样式生成 —— Qwen 生成 HTML/CSS"""

import json
from vision import call_qwen

STYLE_SYSTEM = """你是一个服装尺码表设计师。你的任务是根据数据和风格描述，生成一个美观的HTML尺码表。
你必须输出完整、可用的HTML代码，包含内联CSS样式。
表格要求：
- 清晰美观，适合服装行业使用
- 表头与数据行区分明显
- 字体大小适中，适合打印和屏幕查看
- 只输出HTML代码，不要markdown标记，不要解释"""


def build_style_prompt(data, style_desc):
    """构建样式生成 prompt"""
    headers = data.get("headers", [])
    rows = data.get("rows", [])

    data_text = json.dumps({"headers": headers, "rows": rows}, ensure_ascii=False, indent=2)

    return f"""请根据以下尺码表数据和风格描述，生成一个完整的HTML表格。

【尺码表数据】
{data_text}

【风格要求】
{style_desc}

【输出要求】
- 生成一个完整的HTML文件（包含<!DOCTYPE html>）
- 使用内联CSS或<style>标签定义样式
- 表格要有边框、合适的间距、清晰的表头
- 配色和谐，适合服装行业展示
- 表格宽度自适应，适合移动端查看
- 只输出HTML代码，不要其他内容"""


def generate_table_style(data, style_desc, model="qwen3.7-plus"):
    """调用 Qwen 生成带样式的 HTML 尺码表"""
    prompt = build_style_prompt(data, style_desc)
    messages = [
        {"role": "system", "content": STYLE_SYSTEM},
        {"role": "user", "content": prompt},
    ]

    print(f"[API-STYLE] model={model}, style={style_desc[:50]}")
    result = call_qwen(messages, model=model, temperature=0.7)
    print(f"[API-STYLE] result len={len(result)}")

    # 提取 HTML
    html = result.strip()
    # 去掉可能的 markdown 包裹
    if html.startswith("```html"):
        html = html[7:]
    elif html.startswith("```"):
        html = html[3:]
    if html.endswith("```"):
        html = html[:-3]
    html = html.strip()

    return html


def build_style_from_image_prompt(data, image_path):
    """构建从参考图提取风格的 prompt"""
    headers = data.get("headers", [])
    rows = data.get("rows", [])

    data_text = json.dumps({"headers": headers, "rows": rows}, ensure_ascii=False, indent=2)

    return f"""请分析参考图片中尺码表的视觉风格（配色、边框样式、字体风格、表头设计等），
然后用相同的风格为以下数据生成一个完整的HTML表格。

【尺码表数据】
{data_text}

【输出要求】
- 生成一个完整的HTML文件
- 使用内联CSS还原参考图的配色和风格
- 表格要有边框、合适的间距、清晰的表头
- 只输出HTML代码，不要其他内容"""


def generate_table_from_image(data, style_image_path, model="qwen3-vl-plus"):
    """从参考图片提取风格并生成 HTML 尺码表"""
    prompt = build_style_from_image_prompt(data, style_image_path)
    messages = [
        {"role": "system", "content": STYLE_SYSTEM},
        {
            "role": "user",
            "content": [
                {"image": f"file://{style_image_path}"},
                {"text": prompt},
            ],
        }
    ]

    print(f"[API-STYLE-IMG] model={model}, ref={style_image_path}")
    result = call_qwen(messages, model=model, temperature=0.7)
    print(f"[API-STYLE-IMG] result len={len(result)}")

    html = result.strip()
    if html.startswith("```html"):
        html = html[7:]
    elif html.startswith("```"):
        html = html[3:]
    if html.endswith("```"):
        html = html[:-3]
    html = html.strip()

    return html
