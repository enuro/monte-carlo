# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Cache node_modules separately
COPY frontend/package.json ./
RUN npm install

COPY frontend/ .
RUN npm run build

# ── Stage 2: Nginx runtime ───────────────────────────────────────────────────
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy nginx config template and static files
COPY nginx/nginx.conf.template /etc/nginx/conf.d/default.conf.template
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

EXPOSE 80 443

# envsubst '${DOMAIN}' — substitutes only DOMAIN, leaves nginx vars ($host etc.) untouched
CMD ["/bin/sh", "-c", \
     "envsubst '${DOMAIN}' < /etc/nginx/conf.d/default.conf.template \
      > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
