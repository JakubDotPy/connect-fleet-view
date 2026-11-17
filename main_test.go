package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// TestAPathThisModuleDoesNotServeIsRefusedByCode is the refusal half. A client
// branches on the code, so the test reads the code and not the sentence: a
// reworded sentence must not break a caller, and a changed code must.
func TestAPathThisModuleDoesNotServeIsRefusedByCode(t *testing.T) {
	recorder := httptest.NewRecorder()
	routes().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/nothing-here", nil))

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("an unserved path answered %d, want %d", recorder.Code, http.StatusNotFound)
	}

	if got := recorder.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Fatalf("the refusal is %s, want application/problem+json", got)
	}

	var problem struct {
		Code   string            `json:"code"`
		Title  string            `json:"title"`
		Detail string            `json:"detail"`
		Params map[string]string `json:"params"`
	}

	if err := json.Unmarshal(recorder.Body.Bytes(), &problem); err != nil {
		t.Fatalf("the refusal is not JSON: %v", err)
	}

	if want := RouteNotFound.Code().String(); problem.Code != want {
		t.Fatalf("the refusal carries %q, want %q", problem.Code, want)
	}

	// The English is kept beside the code, so a log line and an untranslated
	// screen still read.
	if problem.Title == "" || problem.Detail == "" {
		t.Fatalf("the refusal lost its English: title %q, detail %q", problem.Title, problem.Detail)
	}

	if problem.Params["path"] != "/nothing-here" {
		t.Fatalf("the refusal names the path %q, want /nothing-here", problem.Params["path"])
	}
}

// TestNoSettingIsReadFromTheEnvironment keeps every setting in the manifest. A
// setting read from the environment is one an operator cannot find in the
// manifest, cannot see on the settings pane, and cannot set through the API.
func TestNoSettingIsReadFromTheEnvironment(t *testing.T) {
	source, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}

	if strings.Contains(string(source), "os.Getenv") {
		t.Fatal("main.go reads an environment variable. Declare the setting in module.yaml instead")
	}
}

// TestALayoutSaveNamesTheVersionItRead holds the one rule of the shared
// layout: a save over the version on disk wins and bumps it, and a save over
// an older one is refused by code, so nobody overwrites a change unseen.
func TestALayoutSaveNamesTheVersionItRead(t *testing.T) {
	store := &layoutStore{dir: t.TempDir()}
	mux := http.NewServeMux()
	layoutRoutes(mux, func() *layoutStore { return store })

	put := func(body string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodPut, "/layout", strings.NewReader(body)))

		return recorder
	}

	if got := put(`{"version": 0, "layout": {"units": []}}`); got.Code != http.StatusOK {
		t.Fatalf("the first save answered %d: %s", got.Code, got.Body)
	}

	if got := put(`{"version": 0, "layout": {"units": [{"id": "r1", "shelves": []}]}}`); got.Code != http.StatusConflict ||
		!strings.Contains(got.Body.String(), LayoutChanged.Code().String()) {
		t.Fatalf("a save over an older version answered %d: %s", got.Code, got.Body)
	}

	for _, body := range []string{
		`{"version": 1, "layout": {"shelves": []}}`,
		`{"version": 1, "layout": {"Units": []}}`,
		`{"version": 1, "layout": {"units": [{}]}}`,
		`{"version": null, "layout": {"units": []}}`,
		// Every & is six bytes once encoded, so this would be answered by a bare 500.
		`{"version": 1, "layout": {"units": [{"id": "` + strings.Repeat("&", 200_000) + `", "shelves": []}]}}`,
	} {
		if got := put(body); got.Code != http.StatusBadRequest {
			t.Fatalf("%.60s answered %d, want 400", body, got.Code)
		}
	}

	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/layout", nil))

	var saved Saved
	if err := json.Unmarshal(recorder.Body.Bytes(), &saved); err != nil {
		t.Fatalf("the layout is not JSON: %v", err)
	}

	if saved.Version != 1 || string(saved.Layout) != `{"units":[]}` {
		t.Fatalf("the layout reads version %d %s, want version 1 and the first save", saved.Version, saved.Layout)
	}
}

// TestAnUnreadableLayoutCanBeSavedOver: a file a crash left empty must not
// lock everyone out, so it reads as nothing saved and the next save repairs it.
func TestAnUnreadableLayoutCanBeSavedOver(t *testing.T) {
	store := &layoutStore{dir: t.TempDir()}
	if err := os.WriteFile(store.path(), nil, 0o600); err != nil {
		t.Fatal(err)
	}

	if saved, err := store.load(); err != nil || saved.Version != 0 {
		t.Fatalf("an empty file read as version %d, %v; want version 0", saved.Version, err)
	}

	if _, ok, err := store.save(0, json.RawMessage(`{"units":[]}`), "user:test", time.Now()); !ok || err != nil {
		t.Fatalf("a save over an empty file answered ok %v, %v", ok, err)
	}
}
