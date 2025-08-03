FROM denoland/deno:alpine AS build
WORKDIR /app/src
COPY . .
RUN deno install
RUN deno task build

FROM denoland/deno:alpine AS release
WORKDIR /app
COPY --from=build /app/src/build/ ./build/
COPY --from=build /app/src/import_map.json .

ENV ORIGIN=http://localhost:3000

RUN deno cache --import-map=import_map.json ./build/index.js

EXPOSE 3000
CMD [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "--import-map=import_map.json", "./build/index.js" ]
