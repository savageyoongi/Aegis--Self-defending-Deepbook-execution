from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
import socket


class AegisHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def find_port(start):
    for port in range(start, start + 30):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError("No free local port found")


if __name__ == "__main__":
    requested = int(os.environ.get("PORT", "5173"))
    port = find_port(requested)
    server = ThreadingHTTPServer(("127.0.0.1", port), AegisHandler)
    print(f"Aegis demo: http://127.0.0.1:{port}/frontend/index.html", flush=True)
    server.serve_forever()
