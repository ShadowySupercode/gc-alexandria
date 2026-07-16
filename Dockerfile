FROM denoland/deno:debian-2.9.2 AS build
WORKDIR /app/src
COPY . .

RUN deno install
RUN deno task build

# intermediate cache compilation step needs a shell
FROM denoland/deno:debian-2.9.2 AS cache
WORKDIR /app
COPY --from=build /app/src/build/ ./build/
COPY --from=build /app/src/import_map.json .

RUN deno cache --import-map=import_map.json ./build/index.js

# distroless release image
FROM denoland/deno:distroless-2.9.2 AS release
WORKDIR /app
COPY --from=build /app/src/build/ ./build/
COPY --from=build /app/src/import_map.json .
COPY --from=cache /deno-dir/ /deno-dir/

ENV ORIGIN=http://localhost:3000

EXPOSE 3000
CMD [ "run", "--allow-env", "--allow-read", "--allow-net=0.0.0.0:3000", "--allow-sys=homedir", "--import-map=import_map.json", "./build/index.js" ]
