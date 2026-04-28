VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS  = -ldflags "-s -w -X main.version=$(VERSION)"

.PHONY: dev dev-server dev-simulate-v01 dev-web setup build build-web build-server build-linux build-darwin clean kafka-up kafka-down kafka-logs kafka-seed kafka-seed-reset kafka-produce kafka-consume kafka-consume-all kafka-members kafka-seed-binary dev-full test test-integration create-dev-msk destroy-dev-msk

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

dev-simulate-v01:
	cd server && go run -ldflags "-X main.version=v0.0.1" ./cmd/kpanel

dev-web:
	cd web && bun run dev

build: build-web build-server

build-web:
	cd web && bun install && bun build.ts
	rm -rf server/cmd/kpanel/public
	cp -r web/dist server/cmd/kpanel/public

build-server: build-web
	cd server && CGO_ENABLED=0 go build $(LDFLAGS) -o ../dist/kpanel ./cmd/kpanel

build-linux:
	cd web && bun install && bun build.ts
	rm -rf server/cmd/kpanel/public && cp -r web/dist server/cmd/kpanel/public
	cd server && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build $(LDFLAGS) -o ../dist/kpanel-linux-amd64 ./cmd/kpanel

build-darwin:
	cd web && bun install && bun build.ts
	rm -rf server/cmd/kpanel/public && cp -r web/dist server/cmd/kpanel/public
	cd server && GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build $(LDFLAGS) -o ../dist/kpanel-darwin-arm64 ./cmd/kpanel

clean:
	rm -rf dist server/cmd/kpanel/public web/dist web/node_modules

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

kafka-seed-binary:
	cd server/cmd/kafkaseed && go run . --binary

dev-full: kafka-up
	$(MAKE) dev

create-dev-msk:
	bash .private/msk-test/create-msk.sh

destroy-dev-msk:
	bash .private/msk-test/destroy-msk.sh
