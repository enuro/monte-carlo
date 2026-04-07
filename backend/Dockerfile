# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM rust:1.80-slim AS builder

WORKDIR /app

# Cache dependencies separately (layers won't rebuild unless Cargo files change)
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs \
    && cargo build --release \
    && rm -rf src

# Build actual source
COPY src ./src
# Touch main.rs so Cargo detects the change
RUN touch src/main.rs && cargo build --release

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/monte-carlo-backend /usr/local/bin/

EXPOSE 8080
ENV BACKEND_PORT=8080

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -sf http://localhost:8080/api/calculate \
        -X POST -H "Content-Type: application/json" \
        -d '{"shape":{"type":"preset","preset":{"kind":"circle","params":{"radius":1,"cx":0,"cy":0}},"bounding_box":{"x_min":-2,"x_max":2,"y_min":-2,"y_max":2}},"rng":{"type":"lcg","seed":42},"samples":100}' \
        > /dev/null || exit 1

CMD ["monte-carlo-backend"]
