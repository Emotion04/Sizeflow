"""EXE 自动更新检查 — 仅在 PyInstaller 打包后生效，网页模式自动跳过"""

import sys
import json
import webbrowser
import urllib.request

from config import APP_VERSION

GITHUB_REPO = "emotion04/Sizeflow"
API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"

# 缓存检查结果，避免重复请求
_update_result = None


def _parse_version(v):
    """将版本字符串解析为(数字元组, 预发布权重)，用于比较大小"""
    v = v.strip().lstrip("v")
    if "-" in v:
        base, pre = v.split("-", 1)
    else:
        base, pre = v, None

    parts = []
    for p in base.split("."):
        try:
            parts.append(int(p))
        except ValueError:
            parts.append(0)

    pre_rank = {"dev": 0, "canary": 1, "alpha": 2, "beta": 3, "rc": 4}
    pre_key = pre.split(".")[0].lower() if pre else ""
    pre_val = 9999 if pre is None else pre_rank.get(pre_key, -1)

    return (parts, pre_val)


def _is_newer(latest, current):
    """latest > current → True"""
    lp, lpre = _parse_version(latest)
    cp, cpre = _parse_version(current)

    while len(lp) < len(cp):
        lp.append(0)
    while len(cp) < len(lp):
        cp.append(0)

    if lp != cp:
        return lp > cp
    return lpre > cpre


def check_update():
    """检查 GitHub Release 是否有新版本。
    返回值：{"has_update": bool, "latest": str, "current": str, "url": str}
    仅在 EXE 模式生效，网页模式返回 has_update: False"""
    global _update_result
    if _update_result is not None:
        return _update_result

    if not getattr(sys, 'frozen', False):
        _update_result = {"has_update": False}
        return _update_result

    result = {"has_update": False, "current": APP_VERSION}

    try:
        req = urllib.request.Request(API_URL, headers={"User-Agent": "Sizeflow-Updater"})
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read())
        latest_tag = data.get("tag_name", "")

        if _is_newer(latest_tag, APP_VERSION):
            result = {
                "has_update": True,
                "latest": latest_tag,
                "current": APP_VERSION,
                "url": data.get("html_url", ""),
            }
            print(f"[Updater] 发现新版本: {latest_tag} (当前: {APP_VERSION})")
        else:
            print(f"[Updater] 已是最新版本: {APP_VERSION}")
    except urllib.error.HTTPError as e:
        if e.code == 403:
            print(f"[Updater] GitHub API 限流，跳过更新检查")
        else:
            print(f"[Updater] 检查更新失败 (HTTP {e.code})")
        result["error"] = str(e)
    except Exception as e:
        print(f"[Updater] 检查更新失败: {e}")
        result["error"] = str(e)

    _update_result = result
    return result


def open_download_page():
    """手动打开下载页面"""
    result = check_update()
    url = result.get("url", "")
    if url:
        webbrowser.open(url)
