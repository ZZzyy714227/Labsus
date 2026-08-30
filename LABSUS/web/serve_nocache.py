# 开发用静态服务：禁用浏览器缓存，确保每次刷新拿到最新文件
import http.server, functools, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    # F-72（2026-08-30）：HTTP/1.1 持久连接（旧默认 1.0 每请求重建连接，浏览器
    # 加载大单文件时往返明显变多）
    protocol_version = "HTTP/1.1"

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        # F-72：.cjs 默认落 octet-stream（浏览器不做 MIME 嗅探）、.mjs 显式
        ".cjs": "text/javascript",
        ".mjs": "text/javascript",
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def _try_bind(host, port):
    """F-72：端口占用时给出明确提示并直接退出（旧实现无提示、在 8001 上
    静默失败或与引擎冲突）。"""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind((host, port))
        s.close()
    except OSError as exc:
        print(f"serve_nocache: 端口 {port} 不可用（{exc}）。", file=sys.stderr)
        print(f"  若 8001 上已跑 LABSUS 引擎，请改用 --port 8921（默认）或指定其它端口。",
              file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="LABSUS 开发静态服务（无缓存）")
    ap.add_argument("--port", type=int, default=8921, help="监听端口（默认 8921）")
    ap.add_argument("--host", default="127.0.0.1", help="监听地址（默认 127.0.0.1）")
    args = ap.parse_args()
    _try_bind(args.host, args.port)
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    http.server.ThreadingHTTPServer((args.host, args.port), handler).serve_forever()
