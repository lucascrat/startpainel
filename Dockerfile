# Use Node.js 20 slim as base
FROM node:20-slim

# Install dependencies needed for some node modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Build the frontend
RUN npm run build

# Expose the application port
EXPOSE 3000

# Set environment variable to production
ENV NODE_ENV=production

# Start the application using tsx (as defined in package.json start script)
CMD ["npm", "start"]
