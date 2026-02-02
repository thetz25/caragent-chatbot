FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build 2>/dev/null || echo "No build script yet, skipping"

# Production image
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src 
# Note: In a real prod setup we'd copy dist/ from builder, but for dev we might run ts-node or similar.
# For this V1 dev setup, let's keep it simple and allow running from src with ts-node if needed or dist.

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
