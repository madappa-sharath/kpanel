.PHONY: dev dev-server dev-web setup build build-web build-server build-linux build-darwin clean kafka-up kafka-down kafka-logs kafka-seed kafka-produce dev-full test test-integration

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
	cd server && CGO_ENABLED=0 go build -o ../dist/kpanel ./cmd/kpanel

build-linux:
	cd web && bun install && bun build.ts
	rm -rf server/cmd/kpanel/public && cp -r web/dist server/cmd/kpanel/public
	cd server && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o ../dist/kpanel-linux-amd64 ./cmd/kpanel

build-darwin:
	cd web && bun install && bun build.ts
	rm -rf server/cmd/kpanel/public && cp -r web/dist server/cmd/kpanel/public
	cd server && GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -o ../dist/kpanel-darwin-arm64 ./cmd/kpanel

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
	docker exec kpanel-kafka /opt/kafka/bin/kafka-topics.sh \
		--bootstrap-server localhost:9092 \
		--create --if-not-exists --topic orders --partitions 3 --replication-factor 1
	docker exec kpanel-kafka /opt/kafka/bin/kafka-topics.sh \
		--bootstrap-server localhost:9092 \
		--create --if-not-exists --topic events --partitions 1 --replication-factor 1
	@echo "Test topics created: orders (3 partitions), events (1 partition)"

kafka-produce:
	@for i in 1 2 3 4 5; do \
		UUID=$$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen | tr '[:upper:]' '[:lower:]'); \
		echo "$$UUID:{\"orderId\":$$i,\"item\":\"product-$$i\",\"qty\":$$((RANDOM % 10 + 1)),\"status\":\"pending\"}" | \
		docker exec -i kpanel-kafka /opt/kafka/bin/kafka-console-producer.sh \
			--bootstrap-server localhost:9092 --topic orders \
			--property parse.key=true --property key.separator=:; \
	done
	@for i in 1 2 3 4 5; do \
		UUID=$$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen | tr '[:upper:]' '[:lower:]'); \
		echo "$$UUID:{\"eventId\":$$i,\"type\":\"click\",\"userId\":\"user-$$((RANDOM % 100))\",\"ts\":$$(date +%s)}" | \
		docker exec -i kpanel-kafka /opt/kafka/bin/kafka-console-producer.sh \
			--bootstrap-server localhost:9092 --topic events \
			--property parse.key=true --property key.separator=:; \
	done
	@echo "Produced 5 messages to orders, 5 messages to events"

dev-full: kafka-up
	$(MAKE) dev
