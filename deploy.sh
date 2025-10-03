#!/bin/bash

# 函数：安装 Node.js
install_nodejs() {
    echo "Node.js 未安装。正在尝试自动安装..."

    # 检查并安装 curl (如果需要)
    if ! command -v curl &> /dev/null
    then
        echo "curl 未安装。正在尝试安装 curl..."
        if command -v apt &> /dev/null; then
            sudo apt update && sudo apt install -y curl
        elif command -v yum &> /dev/null; then
            sudo yum install -y curl
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y curl
        else
            echo "无法自动安装 curl。请手动安装 curl 后重试。"
            exit 1
        fi
    fi

    # 使用 NodeSource 脚本安装 Node.js 18 LTS
    # 适用于 Debian/Ubuntu 和 CentOS/RHEL 等系统
    if command -v apt &> /dev/null; then
        echo "检测到 Debian/Ubuntu 系统，使用 NodeSource 安装 Node.js 18..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt install -y nodejs
    elif command -v yum &> /dev/null || command -v dnf &> /dev/null; then
        echo "检测到 CentOS/RHEL/Fedora 系统，使用 NodeSource 安装 Node.js 18..."
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo -E bash -
        sudo yum install -y nodejs || sudo dnf install -y nodejs
    else
        echo "无法自动安装 Node.js。请手动安装 Node.js 18 LTS 版本后重试。"
        exit 1
    fi

    if ! command -v node &> /dev/null; then
        echo "Node.js 自动安装失败。请检查错误信息或手动安装。"
        exit 1
    fi
    echo "Node.js 安装成功。"
}

# 检查是否安装了 Node.js
if ! command -v node &> /dev/null
then
    install_nodejs
fi

# 检查是否安装了 npm (通常随 Node.js 一起安装)
if ! command -v npm &> /dev/null
then
    echo "npm 未安装。Node.js 安装可能不完整或路径问题。请检查。"
    exit 1
fi

echo "Node.js 和 npm 已安装。"

# 进入项目目录
PROJECT_DIR="$(dirname "$0")"
cd "$PROJECT_DIR"

echo "进入项目目录: $(pwd)"

# 安装项目依赖
echo "正在安装项目依赖..."
npm install

if [ $? -ne 0 ]; then
    echo "依赖安装失败。请检查错误信息。"
    exit 1
fi

echo "依赖安装成功。"

# 交互式获取环境变量
read -p "请输入初始管理员用户名 (默认为 admin): " INITIAL_ADMIN_USERNAME_INPUT
INITIAL_ADMIN_USERNAME=${INITIAL_ADMIN_USERNAME_INPUT:-admin}

read -s -p "请输入初始管理员密码 (默认为 adminpass): " INITIAL_ADMIN_PASSWORD_INPUT
INITIAL_ADMIN_PASSWORD=${INITIAL_ADMIN_PASSWORD_INPUT:-adminpass}
echo ""

# 自动生成一个随机的 JWT 密钥
RANDOM_JWT_SECRET=$(head /dev/urandom | tr -dc A-Za-z0-9_.- | head -c 32)

echo "已生成随机 JWT 密钥: ${RANDOM_JWT_SECRET}"
read -p "请输入 JWT 密钥 (按回车键使用随机密钥，或输入自定义密钥): " JWT_SECRET_INPUT
JWT_SECRET=${JWT_SECRET_INPUT:-$RANDOM_JWT_SECRET}
echo ""

export INITIAL_ADMIN_USERNAME
export INITIAL_ADMIN_PASSWORD
export JWT_SECRET

echo "环境变量已设置。"

# 启动应用程序
echo "正在启动聊天室服务器..."
nohup npm start > app.log 2>&1 &

# 获取后台进程的 PID
PID=$!
echo "聊天室服务器已在后台启动，PID: $PID"
echo "日志文件: app.log"
echo "你可以通过访问 http://localhost:3000 来访问聊天室。"
echo "要停止服务器，请运行 kill $PID"

exit 0