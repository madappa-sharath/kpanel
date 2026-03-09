package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/kpanel/kpanel/internal/api"
	"github.com/kpanel/kpanel/internal/config"
)

var version = "dev"

// publicFiles embeds the built React frontend.
// In dev (go run), this directory only has a .gitkeep placeholder — Bun
// serves the frontend on :3000 instead. In production (make build), the
// web/dist output is copied here before go build runs.
//
//go:embed all:public
var publicFiles embed.FS

func main() {
	preferredPort := os.Getenv("KPANEL_PORT")
	if preferredPort == "" {
		preferredPort = "8080"
	}

	configDir := os.Getenv("KPANEL_CONFIG_DIR")
	if configDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			fatal("failed to get home directory: "+err.Error(),
				"set KPANEL_CONFIG_DIR to a writable path")
		}
		configDir = filepath.Join(home, ".kpanel")
	}

	if err := os.MkdirAll(configDir, 0755); err != nil {
		fatal("failed to create config directory: "+err.Error(),
			"set KPANEL_CONFIG_DIR to a writable path")
	}

	store, err := config.NewStore(configDir)
	if err != nil {
		fatal("failed to initialize config store: "+err.Error(),
			"check that "+configDir+" is readable and not corrupted")
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	api.Mount(r, store)

	// Serve embedded frontend for all non-API routes.
	// In dev mode this serves the .gitkeep placeholder (harmless — Bun handles frontend on :3000).
	// In production this serves the full React app.
	publicFS, err := fs.Sub(publicFiles, "public")
	if err != nil {
		fatal("failed to open embedded assets: " + err.Error())
	}
	static := http.FileServer(http.FS(publicFS))
	r.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if strings.HasPrefix(req.URL.Path, "/api/") {
			http.NotFound(w, req)
			return
		}

		cleanPath := strings.TrimPrefix(path.Clean(req.URL.Path), "/")
		if cleanPath == "." || cleanPath == "" {
			cleanPath = "index.html"
		}

		if _, statErr := fs.Stat(publicFS, cleanPath); statErr == nil {
			static.ServeHTTP(w, req)
			return
		}
		if _, statErr := fs.Stat(publicFS, "index.html"); statErr != nil {
			http.NotFound(w, req)
			return
		}

		fallback := req.Clone(req.Context())
		fallback.URL.Path = "/index.html"
		static.ServeHTTP(w, fallback)
	}))

	port, portChanged, err := findPort(preferredPort)
	if err != nil {
		fatal("no available port found: "+err.Error(),
			"set KPANEL_PORT to a specific port, or leave unset for auto-selection")
	}

	addr := ":" + port
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		fatal("failed to bind port "+port+": "+err.Error(),
			"set KPANEL_PORT to a specific port, or leave unset for auto-selection")
	}

	prod := isProd(publicFS)
	url := "http://localhost:" + port
	printBanner(url, configDir, preferredPort, portChanged, prod, version)

	if prod {
		go func() {
			time.Sleep(100 * time.Millisecond)
			openBrowser(url)
		}()
	}

	if err := http.Serve(ln, r); err != nil {
		fatal("server error: " + err.Error())
	}
}

// findPort returns an available port, preferring the given one.
// If the preferred port is in use, the OS assigns a free one.
func findPort(preferred string) (port string, changed bool, err error) {
	ln, err := net.Listen("tcp", ":"+preferred)
	if err == nil {
		ln.Close()
		return preferred, false, nil
	}
	// preferred unavailable — ask OS for any free port
	ln, err = net.Listen("tcp", ":0")
	if err != nil {
		return "", false, err
	}
	ln.Close()
	return strconv.Itoa(ln.Addr().(*net.TCPAddr).Port), true, nil
}

// isProd reports whether the embedded FS contains a built frontend.
func isProd(fsys fs.FS) bool {
	_, err := fs.Stat(fsys, "index.html")
	return err == nil
}

// openBrowser opens url in the default system browser.
func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	default:
		return
	}
	_ = cmd.Start()
}

// printBanner writes the startup banner to stderr.
func printBanner(url, configDir, preferredPort string, portChanged, prod bool, version string) {
	sep := "──────────────────────────────────────────"
	if prod {
		fmt.Fprintf(os.Stderr, "kpanel  ·  local kafka GUI  ·  v%s\n", version)
		fmt.Fprintln(os.Stderr, sep)
		fmt.Fprintf(os.Stderr, "  URL     %s\n", url)
		fmt.Fprintf(os.Stderr, "  Config  %s\n", configDir)
		if portChanged {
			fmt.Fprintf(os.Stderr, "  Note    port %s was in use, using %s\n",
				preferredPort, strings.TrimPrefix(url, "http://localhost:"))
		}
		fmt.Fprintln(os.Stderr, "")
		fmt.Fprintln(os.Stderr, "Opening in browser...")
		fmt.Fprintln(os.Stderr, "Press Ctrl+C to stop")
	} else {
		fmt.Fprintf(os.Stderr, "kpanel  ·  dev server  ·  v%s\n", version)
		fmt.Fprintln(os.Stderr, sep)
		fmt.Fprintf(os.Stderr, "  API     %s\n", url)
		fmt.Fprintf(os.Stderr, "  Config  %s\n", configDir)
		fmt.Fprintf(os.Stderr, "  Web     http://localhost:3000  (bun dev)\n")
		fmt.Fprintln(os.Stderr, sep)
	}
}

// fatal prints a formatted error and exits.
func fatal(msg string, hints ...string) {
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "  Error: "+msg)
	for _, h := range hints {
		fmt.Fprintln(os.Stderr, "  Hint:  "+h)
	}
	fmt.Fprintln(os.Stderr, "")
	os.Exit(1)
}
