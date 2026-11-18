# Build from the repository root: docker build -f frontend/Dockerfile .
FROM node:22-alpine AS build
RUN npm install -g pnpm@12.15.0
WORKDIR /repo
# Next.js reads the API address at build time (it becomes a rewrite rule).
ARG BACKEND_URL=http://backend:4000
ENV BACKEND_URL=$BACKEND_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter @uu/frontend...
COPY shared shared
COPY frontend frontend
RUN pnpm --filter @uu/shared build && pnpm --filter @uu/frontend build

FROM node:22-alpine AS run
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/frontend/.next/standalone ./
COPY --from=build /repo/frontend/.next/static ./frontend/.next/static
COPY --from=build /repo/frontend/public ./frontend/public
USER node
EXPOSE 3000
CMD ["node", "frontend/server.js"]
