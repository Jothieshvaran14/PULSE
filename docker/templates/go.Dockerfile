# Go — Multi-stage build producing a minimal scratch/alpine image

FROM golang:1.22-alpine AS build
WORKDIR /app

# Download dependencies first (layer caching)
COPY go.mod go.sum* ./
RUN go mod download

# Build static binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/server .

FROM alpine:3.20 AS runtime
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=build /app/server .

EXPOSE 8080
CMD ["./server"]
