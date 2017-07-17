package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/unixpickle/essentials"
	"github.com/unixpickle/muniverse/chrome"
)

const RequestTimeout = time.Second * 5

type Server struct {
	DevConn         *chrome.Conn
	URL             string
	RefreshInterval time.Duration

	connLock    sync.Mutex
	lastRefresh time.Time
}

func main() {
	server := &Server{}

	var devtoolsURL string
	var listenAddr string
	flag.StringVar(&devtoolsURL, "devtools", "localhost:9222", "Chrome DevTools server")
	flag.StringVar(&listenAddr, "addr", ":1337", "bind address for server")
	flag.DurationVar(&server.RefreshInterval, "refresh", time.Minute,
		"time between page refreshes")
	flag.StringVar(&server.URL, "url", "", "url of page")
	flag.Parse()

	log.Println("Connecting to Chrome...")
	ctx := context.Background()
	endpoints, err := chrome.Endpoints(ctx, devtoolsURL)
	essentials.Must(err)
	for _, ep := range endpoints {
		if ep.Type == "page" {
			if server.URL == "" {
				server.URL = ep.URL
			}
			server.DevConn, err = chrome.NewConn(ctx, ep.WebSocketURL)
			essentials.Must(err)
		}
	}

	http.HandleFunc("/", server.ServeIndex)
	http.HandleFunc("/eval", server.ServeEval)

	log.Println("Listening at", listenAddr, "...")
	essentials.Must(http.ListenAndServe(listenAddr, nil))
}

func (s *Server) ServeIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Write([]byte(`<!doctype html>
<html>
	<head>
		<meta charset="utf-8">
		<title>safeval.pw</title>
	</head>
	<body>
		<form action="eval">
			<input name="code">
			<input type="submit">
		</form>
	</body>
</html>`))
}

func (s *Server) ServeEval(w http.ResponseWriter, r *http.Request) {
	code := r.FormValue("code")
	s.connLock.Lock()
	defer s.connLock.Unlock()

	if s.shouldRefresh() {
		s.refresh()
	}

	ctx, canceler := context.WithTimeout(r.Context(), RequestTimeout)
	defer canceler()

	actualCode := `Promise.resolve('' + (function() { return ` + code + ` })());`
	var output string
	if err := s.DevConn.EvalPromise(ctx, actualCode, &output); err != nil {
		s.refresh()
		http.Error(w, err.Error(), http.StatusBadRequest)
	}
	w.Header().Set("Content-Type", "text/plain")
	w.Write([]byte(output))
}

func (s *Server) shouldRefresh() bool {
	return time.Since(s.lastRefresh) >= s.RefreshInterval
}

func (s *Server) refresh() {
	if err := s.DevConn.NavigateSafe(context.Background(), s.URL); err != nil {
		s.lastRefresh = time.Time{}
		log.Println(err)
	} else {
		s.lastRefresh = time.Now()
	}
}
