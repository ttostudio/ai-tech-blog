FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY packages/frontend/package.json ./
RUN npm install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY packages/frontend/ ./
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
