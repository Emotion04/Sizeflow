# Sizeflow 项目约定

## 版本号
格式 Canary X.XX，每次 commit message 以 "Canary X.XX: " 开头

## Git
```bash
git -c http.sslVerify=false push origin main
```

## 提交
commit 末尾加 `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`

## 本地服务器
```bash
python server.py    # → localhost:5800
```
修改 `template_service.py` 后必须重启 Flask，否则旧代码继续跑。

## 打包 EXE
```bash
pyinstaller --onefile --name Sizeflow --add-data "templates;templates" --add-data "template;template" --add-data "static;static" --add-data "font;font" --add-data "changelog_cache.json;." --hidden-import dashscope --hidden-import playwright --hidden-import bs4 --hidden-import flask --hidden-import dotenv server.py
```

## 更新日志
每次 push 前: `python update_changelog.py`

## 调试原则
- 先对比预览 (iframe) vs 导出 (Playwright) 的 computed style 差异，再动手
- html2canvas 不支持 opacity:0 / flexbox body / backdrop-filter
- 所有 DOM ID 引用前确保元素存在，否则 JS 整段崩溃
