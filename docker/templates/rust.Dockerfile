# Rust — Multi-stage build with cargo

FROM rust:1.79-alpine AS build
WORKDIR /app

RUN apk add --no-cache musl-dev

# Cache dependencies by building a dummy project first
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release 2>/dev/null || true
RUN rm -rf src

# Build the actual project
COPY . .
RUN cargo build --release

FROM alpine:3.20 AS runtime
RUN apk --no-cache add ca-certificates
WORKDIR /app

# Copy the binary (find the first executable in release)
COPY --from=build /app/target/release/ ./target/
RUN find ./target -maxdepth 1 -type f -executable | head -1 | xargs -I{} cp {} ./app && rm -rf ./target

EXPOSE 8080
CMD ["./app"]
