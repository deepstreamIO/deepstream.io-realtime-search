FROM node:10

# - Copy package json files
COPY ./package*.json ./

# - Install dependencies
RUN npm install --production

# - Copy useful files
COPY . .

ENTRYPOINT ["npm", "run", "start", "--"]
