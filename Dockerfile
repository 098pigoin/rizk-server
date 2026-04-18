FROM node:20-alpine

WORKDIR /app

# Install build dependencies for sqlite3
RUN apk add --no-cache python3 make g++ 

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
