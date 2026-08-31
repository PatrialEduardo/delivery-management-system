FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN go build -o /bin/api ./cmd/api

FROM alpine:3.19
COPY --from=build /bin/api /bin/api
EXPOSE 8080
ENTRYPOINT ["/bin/api"]