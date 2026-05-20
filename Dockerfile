# Use a slim Node image based on Debian (compatible with Ubuntu packages)
FROM --platform=linux/amd64 node:20-bookworm-slim

# 1. Install dependencies required for Google Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    libxss1 \
    libappindicator1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# 2. Add Google's official GPG key & repo, then install google-chrome-stable
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# 3. Set up the working directory
WORKDIR /usr/src/app

# 4. Copy package files and install NPM dependencies
COPY package*.json ./
RUN npm install

# 5. Copy the rest of your application code
COPY . .

# 6. Set the environment variable so Playwright finds the Linux Chrome binary
ENV CHROME_BIN=/usr/bin/google-chrome

# 7. Start the stateless worker script
CMD ["npx", "ts-node", "src/worker.ts"]