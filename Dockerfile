# Use Node.js 20 Alpine as the base image for a small footprint
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install build dependencies for native modules (like better-sqlite3)
RUN apk add --no-cache python3 make g++ sqlite

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Build the frontend assets for production
RUN npm run build

# Create necessary directories for runtime to prevent permission issues
RUN mkdir -p data dataset logs

# Expose the default application port
EXPOSE 3000

# Start the application orchestrator
CMD ["npm", "run", "start"]
