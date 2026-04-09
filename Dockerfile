# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Xóa các file middleware cũ để tránh xung đột với proxy.ts trong Next.js 16
# Đồng thời xóa các thư mục lồng nhau nếu có
RUN rm -f src/middleware.ts src/middleware.js && rm -rf src/src

# Disabling telemetry during build
ENV NEXT_TELEMETRY_DISABLED 1

# Dummy env variables for build time (static analysis)
ENV MONGODB_URI="mongodb://localhost:27017/dummy"
ENV NEXTAUTH_SECRET="dummy_secret_for_build_only"
ENV NEXTAUTH_URL="http://localhost:4000"

RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy essential files and standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 4000

ENV PORT 4000
# set hostname to localhost
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
