FROM node:20

# Create app directory
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install only production dependencies and force sqlite3 to build from source
RUN npm install --production
RUN npm install sqlite3 --build-from-source

# Bundle app source
COPY . .

# Enforce environment configuration for production
ENV NODE_ENV=production
ENV DB_PATH=/data/database.sqlite

# Persistent volume mount point for SQLite data
VOLUME ["/data"]

# Expose the API port
EXPOSE 3000

# Start the application
CMD [ "npm", "start" ]