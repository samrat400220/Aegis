"""Serve this static app on localhost and open it after the server is ready."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import webbrowser


PROJECT_DIR = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8000

os.chdir(PROJECT_DIR)
server = ThreadingHTTPServer((HOST, PORT), SimpleHTTPRequestHandler)
url = f"http://{HOST}:{PORT}/"
print(f"AEGIS preview is running at {url}")
print("Keep this window open. Press Ctrl+C here to stop the local server.")
webbrowser.open(url)

try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nStopping the AEGIS preview server.")
finally:
    server.server_close()
