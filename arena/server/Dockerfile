FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
ENV PORT=2567
ENV ARENA_DATA=/data
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 2567
CMD ["node", "index.js"]
