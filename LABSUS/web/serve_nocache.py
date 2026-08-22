# 开发用静态服务：禁用浏览器缓存，确保每次刷新拿到最新文件
import http.server, functools, os

ROOT = r"c:\Users\zzy\Desktop\New_suspension\LABSUS\web"

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    http.server.ThreadingHTTPServer(("127.0.0.1", 8921), handler).serve_forever()
