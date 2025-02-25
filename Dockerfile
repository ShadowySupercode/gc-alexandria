FROM node:23-alpine AS build

WORKDIR /app

COPY . ./
COPY package.json ./
COPY package-lock.json ./
RUN npm install
RUN npm run build

EXPOSE 80
FROM nginx:1.27.4
COPY --from=build /app/build /usr/share/nginx/html