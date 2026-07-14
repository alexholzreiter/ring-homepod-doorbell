FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY owntone.conf ./owntone.conf

ENV NODE_ENV=production
ENV DATA_DIR=/data
EXPOSE 8585 47129

CMD ["npm", "start"]
