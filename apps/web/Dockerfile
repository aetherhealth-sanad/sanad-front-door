# Sanad web image (T1.4): the built React app behind nginx, which forwards /api to the API.
# Build from the repository root, because pages import ../../../../rules and ../../../../catalogue:
#     docker build -f apps/web/Dockerfile -t sanad-web .
# The client calls the relative path /api and the service worker skips /api/ by path, so the
# API must be served from the same origin. API_HOST is the API container app's name.
FROM node:22-slim AS build
WORKDIR /repo/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web ./
COPY rules /repo/rules
COPY catalogue /repo/catalogue
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
ENV API_HOST=sanad-api
EXPOSE 80
