# Multi-stage build: Stage 1 compiles React → Stage 2 serves it with Nginx.
# Same shape as tools/vehicle-manager/frontend/Dockerfile.

# ---- Stage 1: Build ----
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --silent

COPY . .
# Public URL of Majordom Finance's web app — used by the shared Majordom
# chat-entry button to hand off to Finance's /chat route. Leave empty and
# the button falls back to http://localhost:3000.
ARG VITE_MAJORDOM_FINANCE_URL
ENV VITE_MAJORDOM_FINANCE_URL=$VITE_MAJORDOM_FINANCE_URL
RUN npm run build
# Output: /app/dist/ (Vite default)

# ---- Stage 2: Serve ----
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
