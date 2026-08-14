"""
E2E test fixtures — starts the FastAPI server in a subprocess
and provides a Playwright browser page.
"""
import os
import subprocess
import sys
import tempfile
import time

import pytest
import requests as http_requests

# ── Add src/ to sys.path ──
_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src")
if _src not in sys.path:
    sys.path.insert(0, _src)


def pytest_collection_modifyitems(config, items):
    """Skip browser e2e tests unless FSAE_E2E=1.

    The e2e selectors target the pre-V10 UI and the tests need a headless
    browser + CDN access; they hang otherwise. Re-enable after the Phase 2
    PBR UI rewrite lands (selectors must be updated to the new DOM first).
    """
    if os.environ.get("FSAE_E2E") == "1":
        return
    skip = pytest.mark.skip(reason="browser e2e disabled: set FSAE_E2E=1 to run")
    for item in items:
        if "e2e" in item.nodeid:
            item.add_marker(skip)


SERVER_READY_TIMEOUT = 15  # seconds


@pytest.fixture(scope="session")
def server_port() -> int:
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def server_url(server_port: int) -> str:
    return f"http://127.0.0.1:{server_port}"


@pytest.fixture(scope="session")
def fsae_server(server_port: int, server_url: str):
    """Start the FSAE suspension solver server in a subprocess."""
    _log = tempfile.NamedTemporaryFile(
        prefix="fsae_srv_", suffix=".log", delete=False, mode="w"
    )

    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app",
         "--host", "127.0.0.1", "--port", str(server_port),
         "--log-level", "warning"],
        cwd=_src, stdout=_log, stderr=subprocess.STDOUT,
    )

    deadline = time.time() + SERVER_READY_TIMEOUT
    ready = False
    while time.time() < deadline:
        try:
            resp = http_requests.get(f"{server_url}/api/defaults", timeout=2)
            if resp.status_code == 200:
                ready = True
                break
        except (http_requests.ConnectionError, http_requests.Timeout):
            time.sleep(0.3)

    if not ready:
        proc.kill()
        proc.wait()
        pytest.fail(f"Server did not start within {SERVER_READY_TIMEOUT}s")

    yield server_url

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


@pytest.fixture(scope="session")
def browser_context(playwright):
    """Create a headless Chromium browser context."""
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 800})
    yield context
    context.close()
    browser.close()


@pytest.fixture
def page(browser_context, fsae_server):
    """Create a new page per test, navigate to app, wait for initial load."""
    page = browser_context.new_page()
    page.goto(fsae_server, wait_until="load", timeout=30000)
    # 等待前端 loadDefaults + solveAndUpdate 完成（不依赖 rAF）
    page.wait_for_timeout(3000)
    yield page
    page.close()
