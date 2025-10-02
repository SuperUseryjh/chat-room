# 使用官方 Node.js 18 LTS 镜像作为基础镜像
FROM node:18

# 设置工作目录
WORKDIR /app

# 将 package.json 和 package-lock.json 复制到工作目录
COPY package*.json ./

# 安装项目依赖
RUN npm install

# 将所有文件从当前目录复制到容器的工作目录
COPY . .

# 暴露应用程序运行的端口
EXPOSE 3000

# 定义启动应用程序的命令
# 初始管理员的用户名和密码通过环境变量设置
# 例如: docker run -p 3000:3000 -d -e INITIAL_ADMIN_USERNAME=myadmin -e INITIAL_ADMIN_PASSWORD=mypassword chat-room
CMD ["npm", "start"]
