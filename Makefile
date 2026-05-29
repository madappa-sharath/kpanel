VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS  = -ldflags "-s -w -X main.version=$(VERSION)"
SFW ?= sfw
BUN_INSTALL_CMD = $(SFW) bun install
BUN_INSTALL_FROZEN_CMD = $(SFW) bun install --frozen-lockfile

.PHONY: dev dev-api dev-server dev-simulate-v01 dev-web setup build build-web build-server build-linux build-darwin clean kafka-dev kafka-up kafka-down kafka-logs kafka-seed kafka-seed-if-empty kafka-seed-reset kafka-produce kafka-consume kafka-consume-all kafka-members kafka-seed-binary kafka-seed-sasl kafka-sasl-users dev-full test test-integration create-dev-msk destroy-dev-msk kafka-sasl-up kafka-sasl-down kafka-sasl-logs

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
	cd web && $(BUN_INSTALL_CMD)

dev: kafka-dev
	@echo "Starting kpanel dev environment..."
	@trap 'kill 0' EXIT; \
	$(MAKE) dev-api & \
	$(MAKE) dev-web & \
	wait

dev-api:
	cd server && go run ./cmd/kpanel

dev-server: kafka-dev dev-api

dev-simulate-v01:
	cd server && go run -ldflags "-X main.version=v0.0.1" ./cmd/kpanel

dev-web:
	cd web && bun run dev

build: build-web build-server

build-web:
	cd web && $(BUN_INSTALL_FROZEN_CMD) && bun build.ts
	rm -rf server/cmd/kpanel/public
	cp -r web/dist server/cmd/kpanel/public

build-server: build-web
	cd server && CGO_ENABLED=0 go build $(LDFLAGS) -o ../dist/kpanel ./cmd/kpanel

build-linux:
	cd web && $(BUN_INSTALL_FROZEN_CMD) && bun build.ts
	rm -rf server/cmd/kpanel/public && cp -r web/dist server/cmd/kpanel/public
	cd server && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build $(LDFLAGS) -o ../dist/kpanel-linux-amd64 ./cmd/kpanel

build-darwin:
	cd web && $(BUN_INSTALL_FROZEN_CMD) && bun build.ts
	rm -rf server/cmd/kpanel/public && cp -r web/dist server/cmd/kpanel/public
	cd server && GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build $(LDFLAGS) -o ../dist/kpanel-darwin-arm64 ./cmd/kpanel

clean:
	rm -rf dist server/cmd/kpanel/public web/dist web/node_modules

kafka-dev: kafka-up kafka-seed-if-empty

kafka-up:
	docker compose up -d --wait
	$(MAKE) kafka-sasl-users
	@echo "Kafka ready:"
	@echo "  PLAINTEXT      localhost:9092"
	@echo "  SASL_PLAINTEXT localhost:9094"

kafka-down:
	docker compose down

kafka-logs:
	docker compose logs -f kafka

kafka-seed:
	cd server/cmd/kafkaseed && go run .

kafka-seed-if-empty:
	cd server/cmd/kafkaseed && go run . --if-empty

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

kafka-seed-sasl:
	cd server/cmd/kafkaseed && go run . --broker localhost:9094 --sasl-mechanism plain --sasl-user alice --sasl-password alice-secret --if-empty

dev-full: kafka-up
	$(MAKE) dev

create-dev-msk:
	bash .private/msk-test/create-msk.sh

destroy-dev-msk:
	bash .private/msk-test/destroy-msk.sh

# SASL test environment — same broker/data as PLAINTEXT, exposed on localhost:9094.
# Supports PLAIN (static) and SCRAM-SHA-256/512.
# Credentials: admin/admin-secret  and  alice/alice-secret
kafka-sasl-users:
	@echo "Seeding SCRAM users..."
	docker exec kpanel-kafka /opt/kafka/bin/kafka-configs.sh \
		--bootstrap-server localhost:9094 \
		--command-config /etc/kafka/client.properties \
		--alter --add-config 'SCRAM-SHA-256=[password=admin-secret]' \
		--entity-type users --entity-name admin
	docker exec kpanel-kafka /opt/kafka/bin/kafka-configs.sh \
		--bootstrap-server localhost:9094 \
		--command-config /etc/kafka/client.properties \
		--alter --add-config 'SCRAM-SHA-512=[password=admin-secret]' \
		--entity-type users --entity-name admin
	docker exec kpanel-kafka /opt/kafka/bin/kafka-configs.sh \
		--bootstrap-server localhost:9094 \
		--command-config /etc/kafka/client.properties \
		--alter --add-config 'SCRAM-SHA-256=[password=alice-secret]' \
		--entity-type users --entity-name alice
	docker exec kpanel-kafka /opt/kafka/bin/kafka-configs.sh \
		--bootstrap-server localhost:9094 \
		--command-config /etc/kafka/client.properties \
		--alter --add-config 'SCRAM-SHA-512=[password=alice-secret]' \
		--entity-type users --entity-name alice

kafka-sasl-up: kafka-up
	@echo ""
	@echo "Kafka (SASL) ready at localhost:9094"
	@echo "  SASL/PLAIN:         admin/admin-secret  or  alice/alice-secret"
	@echo "  SASL/SCRAM-SHA-256: admin/admin-secret  or  alice/alice-secret"
	@echo "  SASL/SCRAM-SHA-512: admin/admin-secret  or  alice/alice-secret"

kafka-sasl-down: kafka-down

kafka-sasl-logs:
	docker compose logs -f kafka
