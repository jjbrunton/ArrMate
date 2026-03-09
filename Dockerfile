FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx drizzle-kit generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ARG APP_VERSION=""
ARG APP_COMMIT_SHA=""
ARG APP_RELEASE_REPOSITORY=""
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_VERSION=$APP_VERSION
ENV APP_COMMIT_SHA=$APP_COMMIT_SHA
ENV APP_RELEASE_REPOSITORY=$APP_RELEASE_REPOSITORY

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DB_PATH=/app/data/arrmate.db

CMD ["node", "server.js"]
