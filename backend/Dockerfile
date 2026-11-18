# Build from the repository root: docker build -f backend/Dockerfile .
FROM node:22-alpine AS build
RUN npm install -g pnpm@12.15.0
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter @uu/backend...
COPY shared shared
COPY backend backend
RUN pnpm --filter @uu/shared build && pnpm --filter @uu/backend build
RUN pnpm --filter @uu/backend deploy --legacy --prod /out \
  && cp -r backend/dist /out/dist

FROM node:22-alpine AS run
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=20s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health || exit 1
CMD ["node", "dist/main.js"]
