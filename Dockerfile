# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.18.0

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY modules/package.json modules/package.json
COPY modules/check-in/package.json modules/check-in/package.json
COPY modules/levels/package.json modules/levels/package.json
COPY modules/points/package.json modules/points/package.json
COPY modules/rewards/package.json modules/rewards/package.json
COPY modules/tasks/package.json modules/tasks/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=familystar-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS build
ARG API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=$API_INTERNAL_URL
COPY . .
RUN pnpm build

FROM node:${NODE_VERSION}-alpine AS web
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

FROM base AS backend-runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
USER node

FROM backend-runtime AS api
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]

FROM backend-runtime AS worker
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/worker.js"]
