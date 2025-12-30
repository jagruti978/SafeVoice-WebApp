# Step1 : Base image (Node environment)
FROM node:16

# Step2 : Create app folder inside container
WORKDIR /app

# Step 3: Copy package files first (for caching)
COPY package*.json ./

# Step 4: Install dependencies
RUN npm install

# Step 5: Copy remaining app files
COPY . .

# Step 6: App runs on this port
EXPOSE 3000

# Step 7 : Start the app
CMD ["node", "app.js"]
