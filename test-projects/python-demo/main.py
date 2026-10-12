import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = int(os.environ.get('PORT', 4000))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        response = {
            'status': 'ONLINE',
            'platform': 'MyCloud Python Engine',
            'runtime': 'Python 3.11 Native Process',
            'port': PORT,
            'pid': os.getpid()
        }
        self.wfile.write(json.dumps(response).encode('utf-8'))

    def log_message(self, format, *args):
        print(f"[Python Service] {args[0]} - {args[1]}")

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', PORT), Handler)
    print(f"[Python Service] Listening on http://0.0.0.0:{PORT}")
    server.serve_forever()
