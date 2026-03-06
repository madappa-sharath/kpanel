.PHONY: dev dev-server dev-web setup build build-web build-server build-linux build-darwin clean kafka-up kafka-down kafka-logs kafka-seed kafka-seed-reset kafka-produce kafka-consume kafka-consume-all kafka-members dev-full test test-integration release-snapshot

VERSION ?= dev
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo none)
DATE ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
GO_LDFLAGS := -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)
GO_FLAGS := -trimpath -ldflags "$(GO_LDFLAGS)"

test:
	cd server && go test ./...

# Runs integration tests against a real Kafka.
# Local:  make kafka-up && make test-integration   (uses compose broker)
# CI:     make test-integration                    (spins up testcontainers)
test-integration:
	cd server && go test -tags integration -timeout 120s ./internal/api/...

test-integration-local:
	cd server && TEST_KAFKA_BROKER=localhost:9092 go test -tags integration -timeout 30s ./internal/api/...

setup:
	cd server && go mod tidy
	cd server/cmd/kafkaseed && go mod tidy
	cd web && bun install

dev:
	@echo "Starting kpanel dev environment..."
	@trap 'kill 0' EXIT; \
	$(MAKE) dev-server & \
	$(MAKE) dev-web & \
	wait

dev-server:
	cd server && go run ./cmd/kpanel

dev-web:
	cd web && bun run dev

build: build-web build-server

build-web:
	cd web && bun install && bun build.ts
	rm -rf server/cmd/kpanel/public
	cp -r web/dist server/cmd/kpanel/public

build-server: build-web
	mkdir -p dist
	cd server && CGO_ENABLED=0 go build $(GO_FLAGS) -o ../dist/kpanel ./cmd/kpanel

build-linux:
	cd web && bun install && bun build.ts
	rm -rf server/cmd/kpanel/public && cp -r web/dist server/cmd/kpanel/public
	mkdir -p dist
	cd server && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build $(GO_FLAGS) -o ../dist/kpanel-linux-amd64 ./cmd/kpanel

build-darwin:
	cd web && bun install && bun build.ts
	rm -rf server/cmd/kpanel/public && cp -r web/dist server/cmd/kpanel/public
	mkdir -p dist
	cd server && GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build $(GO_FLAGS) -o ../dist/kpanel-darwin-arm64 ./cmd/kpanel

clean:
	rm -rf dist server/cmd/kpanel/public web/dist web/node_modules
	mkdir -p server/cmd/kpanel/public && touch server/cmd/kpanel/public/.gitkeep

release-snapshot:
	goreleaser release --snapshot --clean

kafka-up:
	docker compose up -d
	@echo "Kafka ready at localhost:9092"

kafka-down:
	docker compose down

kafka-logs:
	docker compose logs -f kafka

kafka-seed:
	cd server/cmd/kafkaseed && go run .

kafka-seed-reset:
	cd server/cmd/kafkaseed && go run . --reset

kafka-produce:
	cd server/cmd/kafkaseed && go run . --produce

kafka-consume:
	cd server/cmd/kafkaseed && go run . --consume

kafka-consume-all:
	cd server/cmd/kafkaseed && go run . --drain

kafka-members:
	cd server/cmd/kafkaseed && go run . --members

dev-full: kafka-up
	$(MAKE) dev
