# ---- Base: install deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Build main app ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime: browsemind ----
FROM node:20-alpine AS browsemind
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/server.js"]

# ---- Runtime: meditrack ----
FROM node:20-alpine AS meditrack
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY mock-websites/meditrack ./mock-websites/meditrack
COPY package*.json ./
RUN npm ci --omit=dev
EXPOSE 4300
CMD ["npx", "ts-node", "mock-websites/meditrack/server.ts"]

# ---- Runtime: stockwise ----
FROM node:20-alpine AS stockwise
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY mock-websites/stockwise ./mock-websites/stockwise
COPY package*.json ./
RUN npm ci --omit=dev
EXPOSE 4301
CMD ["npx", "ts-node", "mock-websites/stockwise/server.ts"]