// The floor plan everyone on this server sees: one layout, kept as one JSON
// file in the data directory the operator granted, with a version that every
// save must name so two people editing at once cannot overwrite each other
// unseen.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/prusa3d/prusa-connect/sdk/fault"
	"github.com/prusa3d/prusa-connect/sdk/routesapi"
)

// maxSavedBytes bounds the file, so every saved layout can still be answered:
// the host turns an answer over routesapi.MaxModuleBody into a bare 500. The
// margin covers the version, saved_by and saved_at around the layout.
const maxSavedBytes = routesapi.MaxModuleBody - 4<<10

// errTooLarge is a layout that would encode over maxSavedBytes.
var errTooLarge = errors.New("the layout is too large to save")

// Saved is the layout as the file holds it and the routes answer it. Layout is
// the browser's own shape, kept as it came: this process checks only that it
// is an object with a units list.
type Saved struct {
	// Version counts the saves; 0 means nothing has been saved yet.
	Version int             `json:"version"`
	Layout  json.RawMessage `json:"layout"`
	SavedBy string          `json:"saved_by,omitempty"`
	SavedAt *time.Time      `json:"saved_at,omitempty"`
}

// layoutStore holds the file. The mutex spans read, compare and write, so two
// saves naming the same version cannot both pass the check.
type layoutStore struct {
	mu  sync.Mutex
	dir string
}

func (s *layoutStore) path() string { return filepath.Join(s.dir, "layout.json") }

// load reads the file under the mutex. Holding it for a read too keeps a
// rename on Windows from failing over a file a reader has open.
func (s *layoutStore) load() (Saved, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.read()
}

// read answers nothing saved for a missing file, and for one it cannot decode,
// which a crash mid-write can leave: refusing would also refuse the save that
// repairs it, so the loss is logged and the next save starts over.
func (s *layoutStore) read() (Saved, error) {
	nothing := Saved{Layout: json.RawMessage("null")}

	raw, err := os.ReadFile(s.path())
	if errors.Is(err, fs.ErrNotExist) {
		return nothing, nil
	}

	if err != nil {
		return Saved{}, fmt.Errorf("read the layout: %w", err)
	}

	var saved Saved
	if err = json.Unmarshal(raw, &saved); err != nil || !isLayout(saved.Layout) {
		fmt.Fprintf(os.Stderr, "%s: %s holds no layout, starting over: %v\n", name, s.path(), err)

		return nothing, nil
	}

	return saved, nil
}

// save writes the layout when base is the version on disk, and answers the
// version on disk otherwise, with ok false.
func (s *layoutStore) save(base int, layout json.RawMessage, by string, now time.Time) (Saved, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	current, err := s.read()
	if err != nil {
		return Saved{}, false, err
	}

	if current.Version != base {
		return current, false, nil
	}

	next := Saved{Version: base + 1, Layout: layout, SavedBy: by, SavedAt: &now}

	raw, err := json.Marshal(next)
	if err != nil {
		return Saved{}, false, fmt.Errorf("encode the layout: %w", err)
	}

	if len(raw) > maxSavedBytes {
		return Saved{}, false, errTooLarge
	}

	// A rename within one directory is atomic, so a reader sees the old file
	// or the new one, never half of either.
	tmp, err := os.CreateTemp(s.dir, "layout-*.json")
	if err != nil {
		return Saved{}, false, fmt.Errorf("write the layout: %w", err)
	}

	defer os.Remove(tmp.Name()) //nolint:errcheck // gone after the rename; only a failed write leaves it

	// Synced before the rename, so a power cut leaves the old file or the
	// whole new one, never an empty one under the old name.
	if _, err = tmp.Write(raw); err == nil {
		err = tmp.Sync()
	}

	if err != nil {
		tmp.Close()

		return Saved{}, false, fmt.Errorf("write the layout: %w", err)
	}

	if err = tmp.Close(); err != nil {
		return Saved{}, false, fmt.Errorf("write the layout: %w", err)
	}

	if err = os.Rename(tmp.Name(), s.path()); err != nil {
		return Saved{}, false, fmt.Errorf("write the layout: %w", err)
	}

	syncDir(s.dir)

	return next, true, nil
}

// syncDir makes the rename itself durable. Windows cannot open a directory for
// it and journals the rename anyway, so a failure there is not one.
func syncDir(dir string) {
	if d, err := os.Open(dir); err == nil {
		_ = d.Sync()
		d.Close()
	}
}

// layoutRoutes adds GET and PUT /layout to mux. A nil store means the operator
// granted no data directory, and both routes say so instead of writing anywhere.
func layoutRoutes(mux *http.ServeMux, store func() *layoutStore) {
	mux.HandleFunc("GET /layout", func(w http.ResponseWriter, r *http.Request) {
		held := store()
		if held == nil {
			refuse(w, r, NoDataDirectory.New("the operator granted fleet-view no data directory"))

			return
		}

		saved, err := held.load()
		if err != nil {
			refuse(w, r, LayoutUnreadable.New(err.Error()))

			return
		}

		answer(w, http.StatusOK, saved)
	})

	mux.HandleFunc("PUT /layout", func(w http.ResponseWriter, r *http.Request) {
		held := store()
		if held == nil {
			refuse(w, r, NoDataDirectory.New("the operator granted fleet-view no data directory"))

			return
		}

		// The host already bounds the body to routesapi.MaxModuleBody.
		body, err := io.ReadAll(r.Body)

		var sent map[string]json.RawMessage
		if err == nil {
			err = json.Unmarshal(body, &sent)
		}

		var version *int
		if err == nil {
			err = json.Unmarshal(sent["version"], &version)
		}

		if err != nil || version == nil || !isLayout(sent["layout"]) {
			refuse(w, r, LayoutInvalid.New("the body is not {version, layout} with a list of units"))

			return
		}

		saved, ok, err := held.save(*version, sent["layout"], routesapi.PrincipalOf(r), time.Now().UTC())
		if errors.Is(err, errTooLarge) {
			refuse(w, r, LayoutInvalid.New(err.Error()))

			return
		}

		if err != nil {
			refuse(w, r, LayoutUnreadable.New(err.Error()))

			return
		}

		if !ok {
			refuse(w, r, LayoutChanged.
				New("the layout was saved by someone else since it was read").
				With(fault.StringParam("version", strconv.Itoa(saved.Version))))

			return
		}

		answer(w, http.StatusOK, saved)
	})
}

// isLayout holds a save to what every reader draws from: a units list whose
// every unit has a string id and a list of shelves. Keys are matched exactly,
// because the browser reads them so and Go's decoder would ignore case.
func isLayout(raw json.RawMessage) bool {
	var layout map[string]json.RawMessage
	if json.Unmarshal(raw, &layout) != nil {
		return false
	}

	var units []map[string]json.RawMessage
	if json.Unmarshal(layout["units"], &units) != nil || units == nil {
		return false
	}

	for _, unit := range units {
		var (
			id      string
			shelves []json.RawMessage
		)

		if unit == nil ||
			json.Unmarshal(unit["id"], &id) != nil || id == "" ||
			json.Unmarshal(unit["shelves"], &shelves) != nil || shelves == nil {
			return false
		}
	}

	return true
}
