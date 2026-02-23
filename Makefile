.PHONY: dev dev-server dev-web setup build build-web build-server build-linux build-darwin clean

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
