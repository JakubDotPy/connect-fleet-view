# Builds and checks fleet-view against a pinned Prusa Connect checkout, because
# neither the Go SDK nor the @prusa packages are published yet.

CORE_REPO ?= https://github.com/prusa3d/prusa-connect.git
# A commit of main, because no release tag carries the Ember theme yet. Any
# tag or commit works here; delete .core/ after changing it.
CORE_REF ?= b5102fe2af1940d6ecf13c86d0fe5972e337f0b8
CORE := .core

NAME := $(shell sed -n 's/^name:[[:space:]]*//p' module.yaml | head -1)
VERSION := $(shell sed -n 's/^version:[[:space:]]*//p' module.yaml | head -1)
MODULE := $(shell sed -n 's/^module[[:space:]]*//p' go.mod | head -1)
PLATFORMS := $(shell sh scripts/platforms.sh)

RELEASE := release
export CI ?= true

.PHONY: core check go-check ui-check ui-build release install clean

$(CORE)/.git:
	git init --quiet $(CORE)
	git -C $(CORE) fetch --quiet --depth 1 $(CORE_REPO) $(CORE_REF)
	git -C $(CORE) -c advice.detachedHead=false checkout --quiet FETCH_HEAD

$(CORE)/packages/svelte/dist/build/module.js: | $(CORE)/.git
	cd $(CORE)/packages/svelte && pnpm install --frozen-lockfile
	cd $(CORE)/packages/svelte && pnpm run build

$(CORE)/packages/typescript/dist/index.js: | $(CORE)/.git
	cd $(CORE)/packages/typescript && pnpm install --frozen-lockfile
	cd $(CORE)/packages/typescript && pnpm run build

core: $(CORE)/packages/svelte/dist/build/module.js $(CORE)/packages/typescript/dist/index.js

check: go-check ui-check

go-check: | $(CORE)/.git
	go vet ./...
	go test ./...

ui/node_modules/.modules.yaml: ui/package.json ui/pnpm-lock.yaml | core
	cd ui && pnpm install --frozen-lockfile

ui-check: ui/node_modules/.modules.yaml
	cd ui && pnpm run check
	cd ui && pnpm run build

ui-build: ui/node_modules/.modules.yaml
	cd ui && pnpm run build

# ui/dist is already the release layout: module.yaml at its root and the
# bundle under ui/. Each binary is built with CGO off and -trimpath, so it runs
# on any host of its platform and names no path of the machine that built it.
release: ui-build core
	rm -rf $(RELEASE)
	cp -R ui/dist $(RELEASE)
	cp LICENSE README.md CHANGELOG.md $(RELEASE)/
	@for platform in $(PLATFORMS); do \
		goos=$${platform%%_*}; goarch=$${platform#*_}; \
		binary=$(NAME)_$$platform; [ $$goos = windows ] && binary=$$binary.exe; \
		echo "building $$binary"; \
		CGO_ENABLED=0 GOOS=$$goos GOARCH=$$goarch go build -trimpath -ldflags='-s -w' -o $(RELEASE)/$$binary . || exit 1; \
		chmod +x $(RELEASE)/$$binary; \
	done
	@echo "$(NAME) $(VERSION) is in $(RELEASE)/"

# Installs release/ into bin/try with the pinned core's own `module add`, then
# prints how to start that core with it. Only this machine's binary is needed.
TRY := $(CURDIR)/bin/try
install: release
	mkdir -p $(TRY)
	printf 'core:\n  overlay: %s/resources.json\n  modules: %s/modules\n  authz:\n    database: %s/authz.db\n  api:\n    addr: 127.0.0.1:18480\n' \
		"$(TRY)" "$(TRY)" "$(TRY)" > $(TRY)/config.yaml
	go -C $(CORE) run ./cmd/prusa-connect module add "$(MODULE)@$(VERSION)" \
		-config "$(TRY)/config.yaml" -from "$(CURDIR)/$(RELEASE)" -approve
	@echo
	@echo "Installed. Build the core with its web app once:  make -C $(CORE) build"
	@echo "Then start it:                                    (cd $(TRY) && $(CURDIR)/$(CORE)/bin/server -config config.yaml)"
	@echo "Finish the first run at http://127.0.0.1:18480 with the setup code it logs, and open Fleet View in the sidebar."

clean:
	rm -rf $(RELEASE) bin ui/dist ui/node_modules
