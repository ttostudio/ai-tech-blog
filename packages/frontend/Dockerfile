FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/frontend/package.json ./packages/frontend/package.json
RUN npm ci --workspace=packages/frontend --include-workspace-root

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/frontend/node_modules ./packages/frontend/node_modules
COPY --from=deps /app/package.json ./
COPY packages/frontend ./packages/frontend
RUN npm run build --workspace=packages/frontend

FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
COPY --from=build /app/packages/frontend/dist ./dist
# Hoisted node_modules at root
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/frontend/package.json ./

EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
