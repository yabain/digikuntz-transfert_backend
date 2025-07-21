FROM node:16

WORKDIR /app

COPY package*.json ./

RUN npm install -f

COPY . .

RUN npm run build

EXPOSE 3000

# CMD ["node", "dist/main.js"]
CMD npm run start