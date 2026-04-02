FROM node:20

# Create app directory
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Bundle app source
COPY . .

# Enforce environment configuration for production
ENV NODE_ENV=production
ENV DB_PATH=/app/data/database.sqlite

# Expose the API port
EXPOSE 3000

# Start the application
CMD [ "npm", "start" ]