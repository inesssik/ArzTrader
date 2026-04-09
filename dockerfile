FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install

COPY . .

RUN apt-get update -y && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

# Pass a dummy DATABASE_URL so prisma.config.ts evaluates successfully
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN bun run db:generate


FROM oven/bun:1-slim

WORKDIR /app

# Copy everything, including the generated Prisma client from the builder stage
COPY --from=builder /app /app

ENV NODE_ENV=production

CMD ["sh", "-c", "bun run db:push && bun run start"]