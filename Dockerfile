FROM node:24-bookworm-slim
WORKDIR /workspace/spagbol
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
CMD ["npm", "run", "dev"]
