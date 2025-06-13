FROM node:18-alpine

# Set working directory to the pepimpact directory
WORKDIR /app/pepimpact

# Copy package.json and package-lock.json from the pepimpact directory
COPY pepimpact/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files from the pepimpact directory
COPY pepimpact/ ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE 3000

CMD ["node", "server.js"]
