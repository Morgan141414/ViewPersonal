FROM node:20

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Build
COPY . ./
RUN npm run build

EXPOSE 5173

# Serve built assets
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
