FROM node:20

# Create app directory
WORKDIR /app

# Install build tools needed to compile sqlite3 from source
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Copy dependency definitions
COPY package*.json ./

# Install dependencies and force sqlite3 to build from source
RUN npm install --production --build-from-source

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