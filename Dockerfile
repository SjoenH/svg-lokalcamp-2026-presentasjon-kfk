FROM node:22-alpine

WORKDIR /app

# Install dependencies (including devDeps for the build step)
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Build: inline slides + vite bundle
RUN npm run build:prod

# Remove devDependencies
RUN npm prune --production

EXPOSE 8080

CMD ["node", "server.js"]
