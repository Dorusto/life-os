# Multi-stage build: Stage 1 compiles React → Stage 2 serves it with Nginx.
# Mirrors majordom-financiar/frontend/Dockerfile's pattern.

# ---- Stage 1: Build ----
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies first (separate layer) so Docker cache is reused
# when only source files change.
COPY package.json ./
RUN npm install --silent

# Copy source and build
COPY . .
RUN npm run build
# Output: /app/dist/ (Vite default)

# ---- Stage 2: Serve ----
FROM nginx:alpine

# Replace default Nginx config with ours (SPA routing + API proxy)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled React app from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
