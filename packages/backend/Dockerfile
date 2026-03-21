FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
# Copy root workspace config + lockfile + all relevant workspace package.jsons
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/backend/package.json ./packages/backend/package.json
# npm ci with workspaces hoists everything to root node_modules
RUN npm ci --workspace=packages/shared --workspace=packages/backend --include-workspace-root

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
COPY tsconfig.json ./
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/backend

FROM base AS runtime
ENV NODE_ENV=production
# Copy hoisted node_modules (contains all deps + workspace symlinks)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
# Copy built shared package
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
# Copy built backend
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/package.json ./packages/backend/package.json

WORKDIR /app/packages/backend
EXPOSE 3000
CMD ["node", "dist/index.js"]
