# Static HTML — Served with nginx

FROM nginx:alpine
COPY . /usr/share/nginx/html

# Remove non-web files that shouldn't be served
RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/.dockerignore \
          /usr/share/nginx/html/.git* \
          /usr/share/nginx/html/.env*

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
