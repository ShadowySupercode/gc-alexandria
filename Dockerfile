FROM node:22.13.1-alpine AS build

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
RUN npm install
COPY . ./
RUN npm run build

EXPOSE 80
FROM nginx:1.19-alpine
COPY --from=build /app/build /usr/share/nginx/html