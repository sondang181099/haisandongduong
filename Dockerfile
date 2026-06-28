# Stage 1: Tự động tải thư viện và build Next.js trên server
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Môi trường chạy runtime gọn nhẹ
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=Asia/Ho_Chi_Minh

# Cài đặt Python 3 và pip cho script đồng bộ KiotViet
RUN apk add --no-cache python3 py3-pip libc6-compat

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Cài đặt production dependencies trong container
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy kết quả đã build từ Stage 1 sang Stage 2
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/src ./src
COPY --from=builder /app/entrypoint.js ./entrypoint.js
COPY --from=builder /app/socket-server.js ./socket-server.js

# Copy file requirements và cài dependencies cho Python
COPY kiotviet-sync-python/requirements.txt ./kiotviet-sync-python/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install --break-system-packages -r kiotviet-sync-python/requirements.txt || \
    pip3 install -r kiotviet-sync-python/requirements.txt

# Copy mã nguồn Python sync
COPY kiotviet-sync-python ./kiotviet-sync-python

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 4000

ENV PORT=4000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "entrypoint.js"]
