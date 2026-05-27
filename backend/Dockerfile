# Multi-stage Dockerfile for Go backend
# Stage 1: Development with hot-reloading using Air
FROM golang:1.25-alpine AS dev

WORKDIR /app

# Install git and compile tools for go install
RUN apk add --no-cache git build-base

# Install Air for hot-reloading
RUN go install github.com/air-verse/air@latest

COPY go.mod go.sum ./
RUN go mod download

COPY . .

EXPOSE 8080

CMD ["air", "-c", ".air.toml"]

# Stage 2: Builder for production
FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build a statically linked Go binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/server ./cmd/server

# Stage 3: Production runtime
FROM alpine:latest AS prod

WORKDIR /app

# Install ca-certificates for secure connection to Firebase/external APIs
RUN apk add --no-cache ca-certificates

COPY --from=builder /app/server /app/server

EXPOSE 8080

CMD ["/app/server"]
