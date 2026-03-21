FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./packages/backend/package.json
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN cd packages/shared && npm install
RUN cd packages/backend && npm install

FROM base AS build
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/backend/node_modules ./packages/backend/node_modules
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
COPY tsconfig.json ./
RUN cd packages/shared && npx tsc
RUN cd packages/backend && npx tsc

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=build /app/packages/backend/node_modules ./packages/backend/node_modules

WORKDIR /app/packages/backend
EXPOSE 3000
CMD ["node", "dist/index.js"]
