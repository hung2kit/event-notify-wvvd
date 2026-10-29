FROM node:22-bookworm-slim
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
CMD ["pnpm", "--filter", "@phat-tin/worker", "start"]
