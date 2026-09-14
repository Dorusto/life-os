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
# Public URL of Majordom Finance's web app — used by the shared Majordom
# chat-entry button to hand off to Finance's /chat route. Leave empty and
# the button falls back to http://localhost:3000.
ARG VITE_MAJORDOM_FINANCE_URL
ENV VITE_MAJORDOM_FINANCE_URL=$VITE_MAJORDOM_FINANCE_URL
# Public URL of Majordom Invest's web app, linked from Settings. Leave empty
# and the link falls back to http://localhost:3020.
ARG VITE_INVESTMENT_MANAGER_URL
ENV VITE_INVESTMENT_MANAGER_URL=$VITE_INVESTMENT_MANAGER_URL
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
