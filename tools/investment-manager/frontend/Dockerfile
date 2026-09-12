# Multi-stage build: Stage 1 compiles React → Stage 2 serves it with Nginx.
# Same shape as tools/vehicle-manager/frontend/Dockerfile.

# ---- Stage 1: Build ----
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --silent

COPY . .
RUN npm run build
# Output: /app/dist/ (Vite default)

# ---- Stage 2: Serve ----
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
