# ============================================================
# 《璀璨宝石》联机服务器 Docker 镜像
# 适用于 Render / Railway / 任意 Docker 平台与自建服务器。
# 本地测试：docker build -t splendor . && docker run -p 3000:3000 splendor
# ============================================================
FROM node:20-alpine

WORKDIR /app

# 先复制依赖清单，利用镜像层缓存（依赖不变时 npm install 不重跑）
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 复制应用代码（node_modules 由 .dockerignore 排除）
COPY . .

# 服务器默认端口；Render/Railway 会通过环境变量 PORT 覆盖
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
