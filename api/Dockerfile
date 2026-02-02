FROM node:20-alpine

# Install required libraries for Prisma
RUN apk add --no-cache openssl libssl3

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Generate Prisma Client first (creates @prisma/client types)
RUN npx prisma generate

# Compile TypeScript to JavaScript
RUN npx tsc

EXPOSE 3000

# Run the compiled JavaScript
CMD ["node", "dist/index.js"]
