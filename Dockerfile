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
# Install Chromium, Xvfb for virtual display, x11vnc for VNC server, and noVNC for web-based viewer
RUN apk add --no-cache \
    chromium \
    nss \
    bash \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    xvfb \
    x11vnc \
    supervisor \
    git \
    && git clone --depth 1 https://github.com/novnc/noVNC.git /opt/noVNC \
    && git clone --depth 1 https://github.com/novnc/websockify /opt/noVNC/utils/websockify \
    && apk del git
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    DISPLAY=:99
EXPOSE 3000 6080
# Create supervisor config to run Xvfb, x11vnc, noVNC, and the app
RUN mkdir -p /var/log/supervisor
COPY <<EOF /etc/supervisord.conf
[supervisord]
nodaemon=true
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid

[program:xvfb]
# Screen, not viewport. Chromium adds ~85px of tab strip and address bar on top
# of the 1280x720 viewport the agent pins in code, so the window is ~1288x805 —
# taller than a 720px screen. The bottom strip was never rendered into the
# framebuffer, so noVNC could not show it at any zoom, and the submit button at
# the foot of a long form was permanently invisible to a watching operator.
# Enlarging the screen leaves the viewport, screenshots, and the LLM's 1280x720
# coordinate space untouched.
command=Xvfb :99 -screen 0 1440x1000x24
autorestart=true
stdout_logfile=/var/log/supervisor/xvfb.log
stderr_logfile=/var/log/supervisor/xvfb_err.log

[program:x11vnc]
command=x11vnc -display :99 -forever -shared -rfbport 5900 -nopw
autorestart=true
stdout_logfile=/var/log/supervisor/x11vnc.log
stderr_logfile=/var/log/supervisor/x11vnc_err.log

[program:novnc]
command=/opt/noVNC/utils/novnc_proxy --vnc localhost:5900 --listen 6080
autorestart=true
stdout_logfile=/var/log/supervisor/novnc.log
stderr_logfile=/var/log/supervisor/novnc_err.log

[program:browsemind]
command=node dist/server.js
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
EOF
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]

# ---- Runtime: meditrack ----
FROM node:20-alpine AS meditrack
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY mock-websites/meditrack ./mock-websites/meditrack
COPY package*.json ./
RUN npm install -g typescript @types/node
RUN tsc mock-websites/meditrack/server.ts --target ES2020 --module commonjs --esModuleInterop --skipLibCheck --strict false --types node --outDir ./dist/meditrack
# Dual-stack: localhost resolves to ::1 first, so IPv4-only would be refused.
ENV BIND_HOST=::
# Keep the SQLite file in /app/db so a mounted volume actually captures it.
# mkdir matters for a bare `docker run` with no mount — better-sqlite3 will not
# create a missing parent directory.
RUN mkdir -p /app/db
ENV DB_PATH=/app/db/meditrack.db
EXPOSE 4300
CMD ["node", "dist/meditrack/server.js"]

# ---- Runtime: stockwise ----
FROM node:20-alpine AS stockwise
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY mock-websites/stockwise ./mock-websites/stockwise
COPY package*.json ./
RUN npm install -g typescript @types/node
RUN tsc mock-websites/stockwise/server.ts --target ES2020 --module commonjs --esModuleInterop --skipLibCheck --strict false --types node --outDir ./dist/stockwise
# Dual-stack: localhost resolves to ::1 first, so IPv4-only would be refused.
ENV BIND_HOST=::
# Keep the SQLite file in /app/db so a mounted volume actually captures it.
# mkdir matters for a bare `docker run` with no mount — better-sqlite3 will not
# create a missing parent directory.
RUN mkdir -p /app/db
ENV DB_PATH=/app/db/stockwise.db
EXPOSE 4301
CMD ["node", "dist/stockwise/server.js"]