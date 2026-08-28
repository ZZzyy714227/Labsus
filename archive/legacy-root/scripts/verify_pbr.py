# -*- coding: utf-8 -*-
"""Headless browser verification of the PBR full-car rebuild (Task 10)."""
import json
import sys
import time

import requests
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8000"


def wait_server(timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            r = requests.get(f"{BASE}/api/defaults", timeout=3)
            if r.status_code == 200:
                return r.json()
        except requests.RequestException:
            time.sleep(0.5)
    raise RuntimeError("server not ready")


def main():
    defaults = wait_server()
    assert defaults["cabin"], "cabin missing"
    print("backend OK: frame nodes", len(defaults["frame"]["nodes"]),
          "tubes", len(defaults["frame"]["tubes"]),
          "faces", len(defaults["bodywork"]), "cabin", len(defaults["cabin"]))

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE, wait_until="load", timeout=60000)
        page.wait_for_timeout(9000)          # CDN three + init + first rebuild

        # 1. initial car built?
        summary = page.evaluate("window.__workbench.getPointSetSummary()")
        print("pointset initial:", summary["total"], "points,",
              len(summary["items"]), "parts")

        # 2. drive the solver through the test hook
        page.evaluate("window.__workbench.state.travel.front = 20")
        page.evaluate("window.__workbench.state.travel.rack = 8")
        page.evaluate("window.__workbench.runSolve()")
        page.wait_for_timeout(2500)
        solved = page.evaluate("window.__workbench.state.solveResult !== null")
        print("solve after travel/rack:", solved)
        summary2 = page.evaluate("window.__workbench.getPointSetSummary()")
        print("pointset after solve:", summary2["total"], "points")

        # 3. view presets don't throw
        for v in ["top", "side", "front", "driver", "default"]:
            page.evaluate(f"window.__workbench.setView('{v}')")
        page.wait_for_timeout(400)

        # 4. export smoke (JSON content produced in browser)
        js = page.evaluate("""() => {
          const s = window.__workbench.getPointSetSummary();
          return { total: s.total, items: s.items.slice(0, 6) };
        }""")
        print("parts:", json.dumps(js["items"], ensure_ascii=False))

        # 5. frame rate probe (rAF count over ~2s) + renderer string
        fps, rendererName = page.evaluate("""async () => {
          const gl = document.querySelector('canvas').getContext('webgl2')
                     || document.querySelector('canvas').getContext('webgl');
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
          const fps = await new Promise((resolve) => {
            let n = 0; const t0 = performance.now();
            const tick = () => {
              n++;
              if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
              else resolve(Math.round(n / 2));
            };
            requestAnimationFrame(tick);
          });
          return [fps, name];
        }""")
        software = any(k in rendererName.lower() for k in
                       ["swiftshader", "llvmpipe", "software", "basic render"])
        print(f"fps: {fps}  renderer: {rendererName}"
              + ("  (software rasterizer — fps not representative)" if software else ""))

        page.screenshot(path=r"C:\Users\zzy\Desktop\New_suspension\data\pbr_check.png")
        browser.close()

    real_errors = [e for e in errors if "favicon" not in e.lower()]
    print("console/page errors:", real_errors if real_errors else "none")
    assert summary["total"] > 10000, "point set too small — car not built"
    assert solved, "solve hook failed"
    if not software:
        assert fps >= 50, f"frame rate too low: {fps}"
    assert not real_errors, f"browser errors: {real_errors}"
    print("ALL RUNTIME CHECKS PASSED")


if __name__ == "__main__":
    main()
