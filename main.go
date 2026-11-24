// Command fleet-view is a module with both halves: this process, which keeps
// the shared floor plan, and a browser bundle under ui/, which draws it.
//
// # The routes
//
//	GET /layout       the floor plan everyone on this server sees, and its version
//	PUT /layout       saves the floor plan over the version the caller read
//
// The paths are relative to the mount, so a caller reaches them under
// /api/v1/modules/com.github.aux.jakubdotpy.connect-fleet-view/. The host
// decides who may call them and then makes the call: view_resource on the
// instance for a read, operate_resource for a write. This process checks no
// permission and holds no grant.
//
// # Errors
//
// faults.go lists every error code of this module. The module answers a
// request it cannot serve with one of those codes and its English title. It
// never answers with a sentence alone, because a caller cannot check one.
//
// # Building it
//
//	make check release
//
// README.md says what each target does.
package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"

	"github.com/prusa3d/prusa-connect/sdk/extension"
	"github.com/prusa3d/prusa-connect/sdk/fault"
	"github.com/prusa3d/prusa-connect/sdk/routesapi"
	"github.com/prusa3d/prusa-connect/sdk/wire"
	"github.com/prusa3d/prusa-connect/sdk/wirerpc"
)

// What this child reports when the host asks it what it is. The name is the
// manifest's, and the host holds the two to each other.
const (
	name    = "fleet-view"
	release = extension.Version("0.2.0")
)

// layouts is where the floor plan is kept, set once the host sends the data
// directory; nil until then, or when the operator granted none.
//
//nolint:gochecknoglobals // set on plugin.configure, read by the routes.
var layouts atomic.Pointer[layoutStore]

// openAPI is the fragment describing the route, with every path relative to
// the mount. The host holds it to routesapi.ParseFragment at launch and serves
// it rebased under the namespace, which is what cmd/generate-client-sdk reads
// to type this module's surface.
//
//go:embed openapi.json
var openAPI []byte

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", name, err)
		os.Exit(1)
	}
}

// run writes the handshake line and then serves frames until the host closes
// the channel.
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	line, err := wire.Handshake{
		Protocol: wire.ProtocolMajor,
		MinMinor: wire.MinMinor,
		MaxMinor: wire.MaxMinor,
		Address:  wire.StdioAddress,
	}.Line()
	if err != nil {
		return fmt.Errorf("render the handshake: %w", err)
	}

	if _, err = os.Stdout.WriteString(line); err != nil {
		return fmt.Errorf("write the handshake: %w", err)
	}

	conn, err := wirerpc.NewConn(stdio{}, wirerpc.Options{
		Role:    wirerpc.RoleChild,
		Methods: methods(),
	})
	if err != nil {
		return fmt.Errorf("build the session: %w", err)
	}

	// The pid is here because the host's log is the only place a person sees
	// this process. Nothing on the wire carries it.
	fmt.Fprintf(os.Stderr, "%s %s is serving on stdio as pid %d\n", name, release, os.Getpid())

	if err = conn.Serve(ctx); err != nil {
		return fmt.Errorf("serve: %w", err)
	}

	return nil
}

// methods is the lifecycle set every child answers, plus the one call that
// carries this module's own HTTP surface.
func methods() wirerpc.Methods {
	return wirerpc.Methods{
		wirerpc.MethodInfo: func(context.Context, wirerpc.Call) (any, error) {
			return routesapi.Describe(
				wirerpc.Info{
					Name:     name,
					Version:  release,
					Contract: wirerpc.Contract,
					// Naming the call is what asks the host for the settings. A
					// module that names none is never configured.
					Serves: []wirerpc.Method{wirerpc.MethodConfigure},
				}, openAPI)
		},
		// Sent once before the first request. The module has no settings; the
		// call is here for the data directory the operator granted.
		wirerpc.MethodConfigure: wirerpc.ConfigureGranted(func(_ context.Context, _ struct{}, grants wirerpc.Grants) error {
			if grants.Data != "" {
				layouts.Store(&layoutStore{dir: grants.Data})
			}

			return nil
		}),
		wirerpc.MethodShutdown: func(context.Context, wirerpc.Call) (any, error) {
			fmt.Fprintf(os.Stderr, "%s was asked to stop\n", name)

			return nil, nil
		},
		routesapi.MethodServe: routesapi.Serve(routes()),
	}
}

// routes is the surface this module serves. The paths carry no prefix: the host
// mounts them under the namespace.
// /api/v1/modules/com.github.aux.jakubdotpy.connect-fleet-view/fleet-view to a caller.
func routes() http.Handler {
	mux := http.NewServeMux()

	layoutRoutes(mux, layouts.Load)

	// Everything else is this module's own refusal. It carries the code from
	// faults.go and names the path, which is what proves the group prefix was
	// taken off before the request arrived.
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		refuse(w, r, RouteNotFound.
			New("this module serves no route at "+r.URL.Path).
			With(fault.StringParam("path", r.URL.Path)))
	})

	return mux
}

// answer writes one JSON body, which is every route above.
func answer(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	_ = json.NewEncoder(w).Encode(body)
}

// stdio is the pair the host handed over. Close shuts the reading half, which
// is what ends a session whose host has gone quiet.
type stdio struct{}

func (stdio) Read(p []byte) (int, error)  { return os.Stdin.Read(p) }
func (stdio) Write(p []byte) (int, error) { return os.Stdout.Write(p) }
func (stdio) Close() error                { return os.Stdin.Close() }
