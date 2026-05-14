@echo off
chcp 65001 >nul 2>&1
title 工厂尺码表转换工具

echo ======================================
echo   工厂尺码表转换工具 v1.0
echo   正在启动服务...
echo ======================================
echo.

cd /d "%~dp0"

:: Check .env
if not exist ".env" (
    if exist ".env.example" (
        echo [提示] 首次运行，从 .env.example 创建 .env 文件
        copy ".env.example" ".env" >nul
        echo 请编辑 .env 文件，填入你的 DashScope API Key
        echo 获取 Key: https://help.aliyun.com/zh/model-studio/get-api-key
        echo.
        notepad ".env"
    ) else (
        echo [错误] 未找到 .env 或 .env.example 文件
        pause
        exit /b 1
    )
)

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.8+
    echo 下载: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Install dependencies
echo [信息] 检查依赖...
pip install -r requirements.txt -q 2>nul

:: Start
echo [信息] 启动服务，浏览器将自动打开...
echo         手动访问: http://localhost:5800
echo         按 Ctrl+C 停止服务
echo.
start "" "http://localhost:5800"
python server.py

pause
