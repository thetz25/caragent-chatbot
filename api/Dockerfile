FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Compile TypeScript (if fails, container will show error)
RUN npx tsc

EXPOSE 3000

CMD ["node", "dist/index.js"]
