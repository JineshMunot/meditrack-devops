# ---- stage 1: dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund

# ---- stage 2: test + dependency audit (Jenkins builds with --target test) ----
FROM deps AS test
COPY . .
RUN npm test && npm audit --audit-level=critical

# ---- stage 3: small, non-root production image ----
FROM node:22-alpine AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY public ./public
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
