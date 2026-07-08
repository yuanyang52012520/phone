@echo off
chcp 65001 >nul
echo ══════════════════════════════════════════════════════
echo   🍽️ 食客系统 - 配置检查工具
echo ══════════════════════════════════════════════════════
echo.

:: 检查 Node.js
echo [1/6] 检查 Node.js 版本...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo    ❌ 未安装 Node.js，请先安装 (https://nodejs.org)
    goto :error
)
for /f "tokens=*" %%i in ('node --version') do echo    ✅ Node.js: %%i

:: 检查 pnpm
echo.
echo [2/6] 检查 pnpm...
pnpm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo    ❌ 未安装 pnpm，请执行: npm install -g pnpm
    goto :error
)
for /f "tokens=*" %%i in ('pnpm --version') do echo    ✅ pnpm: %%i

:: 检查 .env 文件
echo.
echo [3/6] 检查 .env 文件...
if not exist .env (
    echo    ❌ 未找到 .env 文件
    goto :error
)
echo    ✅ .env 文件存在

:: 检查关键环境变量
findstr /C:"SUPABASE_URL" .env >nul && echo    ✅ SUPABASE_URL 已配置 || echo    ⚠️  SUPABASE_URL 缺失
findstr /C:"SUPABASE_SERVICE_ROLE_KEY" .env >nul && echo    ✅ SUPABASE_SERVICE_ROLE_KEY 已配置 || echo    ⚠️  SUPABASE_SERVICE_ROLE_KEY 缺失
findstr /C:"JWT_SECRET" .env >nul && echo    ✅ JWT_SECRET 已配置 || echo    ⚠️  JWT_SECRET 缺失（将使用默认值）

:: 检查依赖
echo.
echo [4/6] 检查依赖包...
if not exist node_modules (
    echo    ⏳ 正在安装依赖...
    pnpm install
    if %errorlevel% neq 0 (
        echo    ❌ 依赖安装失败
        goto :error
    )
) else (
    echo    ✅ 依赖已安装
)

:: 检查端口占用
echo.
echo [5/6] 检查端口 3001...
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do set PID=%%a
    echo    ⚠️  端口 3001 被进程 %PID% 占用
    echo       可选择: 1. 结束该进程 2. 修改端口
) else (
    echo    ✅ 端口 3001 可用
)

:: 检查数据库表（提示）
echo.
echo [6/6] 数据库准备状态...
echo    ⚠️  请确保已在 Supabase 执行 database/profiles.sql
echo       地址: https://supabase.com/dashboard/project/zxugomsqlzoxdkkgjyar/sql/new
echo.

echo ══════════════════════════════════════════════════════
echo   🎉 检查完成！
echo ══════════════════════════════════════════════════════
echo.
echo 下一步操作:
echo   1. 打开 Supabase SQL Editor 创建 profiles 表
echo   2. 运行启动命令: pnpm dev
echo   3. 或分别运行: pnpm dev:server ^& pnpm dev:web
echo.
echo 快速测试命令:
echo   curl http://localhost:3001/api/health
echo.

goto :end

:error
echo.
echo ══════════════════════════════════════════════════════
echo   ❌ 检查失败！请解决以上问题后重试
echo ══════════════════════════════════════════════════════
exit /b 1

:end
pause
