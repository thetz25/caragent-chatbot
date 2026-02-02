FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Generate Prisma Client (needed for TypeScript types)
RUN npx prisma generate

# Compile TypeScript
RUN npx tsc

EXPOSE 3000

CMD ["node", "dist/index.js"]
