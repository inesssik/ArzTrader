FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install

COPY . .

RUN apt-get update -y && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

FROM oven/bun:1-slim

WORKDIR /app

COPY --from=builder /app /app

ENV NODE_ENV=production

RUN bun run db:generate
CMD ["bun", "run", "start"]