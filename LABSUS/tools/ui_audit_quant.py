# -*- coding: utf-8 -*-
"""UI 翻新量化验收（2026-11-21）：
① 1920/1600/1366 顶栏零溢出  ② 正文字号 ≥ 下限  ③ --ink-3 对比度 ≥ 4.5:1
④ 同机位截图存档 docs/preview/（改后 revamp_*.png）
usage: python tools/ui_audit_quant.py
"""
import pathlib
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent          # LABSUS/tools
URL = (HERE.parent / "web" / "dwb-pro-v4.html").as_uri()
PREVIEW = HERE.parent.parent / "docs" / "preview"       # New_suspension/docs/preview
fails = []

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge", headless=True)
        for w, h in ((1920, 1080), (1600, 900), (1366, 768)):
            pg = b.new_page(viewport={"width": w, "height": h})
            pg.goto(URL); pg.wait_for_timeout(2400)
            ov = pg.evaluate("() => {const t=document.getElementById('tb');return t.scrollWidth - t.clientWidth;}")
            print(f"[{w}] #tb overflow = {ov}px")
            if ov > 0:
                fails.append(f"{w}px 顶栏溢出 {ov}px")
            if w == 1920:
                fonts = pg.evaluate("""() => {
                  const out = [];
                  [['#lp .ctl>label',10.5],['#lp .ro',10],['#lp .chk',10.5],['.v4-hc .hint',10.5],
                   ['.v4-diag p',10.5],['.sh .zh',12],['#lp .v4-ltab',11.5],
                   ['.v4-pill',10.5],['.v4-seg button',10.5]].forEach(([sel,min])=>{
                    document.querySelectorAll(sel).forEach(el=>{
                      const fs=parseFloat(getComputedStyle(el).fontSize);
                      if(fs < min) out.push(sel+' '+fs+'px < '+min+'px');});});
                  return out;}""")
                print("字体下限违规:", fonts or "无")
                fails.extend(fonts)
                con = pg.evaluate("""() => {
                  const cs=getComputedStyle(document.documentElement);
                  const hx=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(h.trim());return m?parseInt(m[1],16):null;};
                  const c=hx(cs.getPropertyValue('--ink-3')),bg=hx(cs.getPropertyValue('--bg-base'));
                  if(c===null||bg===null)return null;
                  const lum=v=>{const f=x=>{x/=255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4);};
                    return .2126*f((v>>16)&255)+.7152*f((v>>8)&255)+.0722*f(v&255);};
                  const l1=lum(c),l2=lum(bg);
                  return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);}""")
                print(f"ink-3 vs bg-base 对比度: {con}")
                if con is None or con < 4.5:
                    fails.append(f"ink-3 对比度 {con} < 4.5")
            pg.screenshot(path=str(PREVIEW / f"revamp_{w}.png"))
            pg.close()
        b.close()

if __name__ == "__main__":
    run()
    print("FAIL" if fails else "QUANT PASS", fails if fails else "")
