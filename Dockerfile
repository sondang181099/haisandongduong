# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
# Cache npm proxy, giúp npm ci tải file từ cache ở các lần build sau nếu có sự thay đổi trong package.json thay vì tải lại từ internet
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disabling telemetry during build
ENV NEXT_TELEMETRY_DISABLED 1

# Các biến môi trường giả lập cho quá trình build (nếu Next.js yêu cầu)
ENV MONGODB_URI="mongodb://localhost:27017/dummy"
ENV NEXTAUTH_SECRET="dummy_secret_for_build_only"
ENV NEXTAUTH_URL="http://localhost:4000"

RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV TZ=Asia/Ho_Chi_Minh

# Cài đặt Python 3 và pip
RUN apk add --no-cache python3 py3-pip libc6-compat

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy các file cần thiết để chạy với tsx
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src
COPY --from=builder /app/entrypoint.js ./entrypoint.js
COPY --from=builder /app/socket-server.js ./socket-server.js
# Copy requirements file first to leverage Docker cache
COPY kiotviet-sync-python/requirements.txt ./kiotviet-sync-python/requirements.txt

# Cài đặt Python dependencies với cache mount để không phải tải lại các wheel từ internet (bỏ cờ --no-cache-dir)
RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install --break-system-packages -r kiotviet-sync-python/requirements.txt || \
    pip3 install -r kiotviet-sync-python/requirements.txt

# Copy thư mục Python sync
COPY --from=builder /app/kiotviet-sync-python ./kiotviet-sync-python

# Đảm bảo quyền sở hữu cho user nextjs
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 4000

ENV PORT 4000
ENV HOSTNAME "0.0.0.0"

# Sử dụng npx tsx để chạy entrypoint.js (hỗ trợ import .ts trong sync service)
CMD ["npx", "tsx", "entrypoint.js"]
