#!/usr/bin/env python3
"""Local dev server with correct MIME types for ES modules."""
import http.server


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()


print('Serving at http://localhost:8000')
http.server.HTTPServer(('', 8000), Handler).serve_forever()
