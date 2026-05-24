"""从 git log 更新 changelog_cache.json"""
import subprocess, json, os, sys

APP_DIR = os.path.dirname(os.path.abspath(__file__))
cache_path = os.path.join(APP_DIR, "changelog_cache.json")

result = subprocess.run(
    ["git", "log", "-30", "--pretty=format:%h|%s|%ar"],
    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    timeout=10, cwd=APP_DIR
)

commits = []
if result.returncode == 0:
    output = result.stdout.decode("utf-8", errors="replace")
    for line in output.strip().split("\n"):
        if not line: continue
        parts = line.split("|", 2)
        if len(parts) == 3:
            commits.append({"hash": parts[0], "msg": parts[1], "date": parts[2]})

if commits:
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({"commits": commits}, f, ensure_ascii=False, indent=2)
    print(f"Updated changelog_cache.json with {len(commits)} commits")
else:
    print("No commits found, cache unchanged")
