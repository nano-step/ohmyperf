# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json tsconfig.json ./
COPY apps/runner/package.json apps/runner/
COPY packages/core/package.json packages/core/
COPY packages/driver-playwright/package.json packages/driver-playwright/
COPY packages/plugins-builtin/package.json packages/plugins-builtin/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/ packages/
COPY apps/runner/ apps/runner/

RUN pnpm install --frozen-lockfile --ignore-scripts --filter @ohmyperf/runner...
RUN pnpm --filter @ohmyperf/runner... build
RUN pnpm --filter @ohmyperf/runner deploy --prod --legacy /out

FROM mcr.microsoft.com/playwright:v1.59.1-jammy AS runtime

ENV NODE_ENV=production \
    OHMYPERF_RUNNER_BIND=0.0.0.0 \
    OHMYPERF_RUNNER_PORT=5174 \
    OHMYPERF_RUNNER_ALLOW_PRIVATE=0

USER pwuser
WORKDIR /home/pwuser/app

COPY --from=build --chown=pwuser:pwuser /out ./

EXPOSE 5174
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5174/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
