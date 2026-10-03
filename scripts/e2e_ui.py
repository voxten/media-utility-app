# Usage: python scripts/e2e_ui.py [converter pdf duplicates watermark progress tts download]
# Requires a production build (cd frontend && npm run build). Opens a real window.
"""Drives every tool page of the production build in a real pywebview window against the real backend.
Native dialogs are replaced in-page with fixed test paths; everything else goes through the UI."""
import json, sys, tempfile, time, traceback
from pathlib import Path

sys.path.insert(0, ".")
import fitz, numpy as np
from PIL import Image, ImageDraw
import webview
from backend.bridge.api import Api
from backend.bridge.events import EventBus
from backend.core.paths import resource_path
from backend.core.settings import Settings

ONLY = set(sys.argv[1:])  # optional subset of scenarios

tmp = Path(tempfile.mkdtemp(prefix="e2e_"))
out = tmp / "out"; out.mkdir()
src = tmp / "conv"; src.mkdir()
for i in range(4):
    Image.new("RGBA", (120, 90), (i * 60, 100, 200, 255)).save(src / f"c{i}.png")
pdfs = []
for name, n in (("a.pdf", 2), ("b.pdf", 1)):
    d = fitz.open()
    for k in range(n):
        d.new_page().insert_text((50, 80), f"{name}-{k+1}")
    d.save(str(tmp / name)); d.close(); pdfs.append(str(tmp / name))
imgs = tmp / "imgs"; imgs.mkdir()
rng = np.random.default_rng(3)
base = Image.new("RGB", (256, 256), "white"); dr = ImageDraw.Draw(base)
for _ in range(25):
    x, y = rng.integers(0, 200, 2); w, h = rng.integers(10, 60, 2)
    dr.rectangle([int(x), int(y), int(x + w), int(y + h)], fill=tuple(int(c) for c in rng.integers(0, 255, 3)))
base.save(imgs / "orig.png"); base.resize((128, 128)).save(imgs / "small.jpg")
Image.new("RGB", (256, 256), "navy").save(imgs / "other.png")
wm = np.full((240, 320, 3), 140, np.uint8); wm[100:130, 120:220] = (40, 40, 220)
Image.fromarray(wm).save(tmp / "wm.png")

settings = Settings(tmp / "settings.json"); settings.update({"outputDir": str(out), "language": "pl"})
bus = EventBus(); api = Api(bus, settings)
win = webview.create_window("e2e-tools", url=str(resource_path("frontend", "dist", "index.html")), js_api=api, width=1400, height=950)
api._attach_window(win)
report = {}

HELPERS = r"""
window.__t = {
  btn(text){ const all=[...document.querySelectorAll('button,[role=button]')]; return all.find(b => b.textContent.trim() === text) || all.find(b => b.textContent.includes(text)); },
  click(text){ const b = this.btn(text); if(!b) throw new Error('no button ' + text); b.click(); return true; },
  has(text){ return document.body.innerText.includes(text); },
  setValue(el, value){ const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, value); el.dispatchEvent(new Event('input',{bubbles:true})); return true; },
  stub(ns, method, value){ window.pywebview.api[ns][method] = () => Promise.resolve(value); return true; }
};
true
"""


def js(code):
    return win.evaluate_js(code)


def wait(cond, timeout=30, step=0.25):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if js(cond):
                return True
        except Exception:
            pass
        time.sleep(step)
    return False


def goto(route):
    js(f"location.hash = '/{route}'"); time.sleep(0.8); js(HELPERS)


def want(name):
    return not ONLY or name in ONLY


def scenario(w):
    try:
        wait("document.body.innerText.includes('Wszystkie narzędzia')", 20); js(HELPERS)

        if want("converter"):
            goto("converter")
            js(f"__t.stub('dialogs','open_folder', {json.dumps(str(src))})"); js("__t.click('Przeglądaj')")
            wait("__t.has('Znaleziono 4 pliki PNG')", 10)
            js("__t.click('Konwertuj')")
            report["converter"] = wait("__t.has('Podsumowanie') && __t.has('4 / 4')", 30) and sorted(p.name for p in out.glob("*.webp"))

        if want("pdf"):
            goto("pdf")
            js(f"__t.stub('dialogs','open_files', {json.dumps(pdfs)})"); js("document.querySelector('main [role=button]').click()")
            ok_pages = wait("__t.has('3 strony')", 20)
            merged = str(out / "merged.pdf")
            js(f"__t.stub('dialogs','save_file', {json.dumps(merged)})"); js("__t.click('Połącz i zapisz')")
            wait("__t.has('Połączono 3 strony')", 20)
            report["pdf"] = ok_pages and Path(merged).exists() and len(fitz.open(merged))

        if want("duplicates"):
            goto("duplicates")
            js(f"__t.stub('dialogs','open_folder', {json.dumps(str(imgs))})"); js("__t.click('Przeglądaj')"); time.sleep(0.3)
            js("__t.click('Skanuj')")
            found = wait("__t.has('Grupa 1 · 2 pliki')", 30)
            report["duplicates"] = found and js("[...document.querySelectorAll('main img')].length")

        if want("watermark"):
            goto("watermark")
            js(f"__t.stub('dialogs','open_files', {json.dumps([str(tmp / 'wm.png')])})"); js("document.querySelector('main [role=button]').click()")
            wait("!!document.querySelector('main canvas')", 10); time.sleep(0.5)
            js("""(() => { const c=document.querySelector('main canvas'); const r=c.getBoundingClientRect();
              const ev=(t,x,y)=>c.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:r.left+x*r.width,clientY:r.top+y*r.height,pointerId:1,buttons:1}));
              ev('pointerdown',0.36,0.48); for(let i=0;i<=20;i++) ev('pointermove',0.36+i*0.016,0.48); ev('pointerup',0.7,0.48); return true; })()""")
            time.sleep(0.3); js("__t.click('Usuń znak wodny')")
            done = wait("__t.has('Przed') && __t.has('Zapisz jako')", 30)
            clean = str(out / "clean.png")
            js(f"__t.stub('dialogs','save_file', {json.dumps(clean)})"); js("__t.click('Zapisz jako…')"); time.sleep(1.5)
            if Path(clean).exists():
                arr = np.array(Image.open(clean).convert("RGB")).astype(int)
                report["watermark"] = done and f"pixel diff from background: {int(np.abs(arr[115, 170] - 140).max())}"
            else:
                report["watermark"] = f"not saved (done={done})"

        if want("progress"):
            goto("progress")
            png = str(out / "progress.png")
            js(f"__t.stub('dialogs','save_file', {json.dumps(png)})"); js("__t.click('Eksportuj PNG')")
            saved = wait("__t.has('Grafika zapisana')", 30)
            report["progress"] = saved and Path(png).exists() and Image.open(png).size

        if want("tts"):
            goto("tts")
            js("__t.setValue(document.querySelector('textarea'), 'To jest test nowego interfejsu.')")
            wait("!__t.has('Wczytywanie głosów')", 20); time.sleep(0.5)
            js("__t.click('Generuj mowę')")
            ok = wait("__t.has('Odsłuch')", 40)
            report["tts"] = ok and [p.name for p in out.glob("*.mp3")]

        if want("download"):
            goto("download")
            js("__t.setValue(document.querySelector('main input'), 'https://www.youtube.com/watch?v=jNQXAC9IVRw')"); time.sleep(0.3)
            js("__t.click('Sprawdź')")
            probed = wait("__t.has('Me at the zoo')", 40)
            js("__t.click('Gotowe pliki')"); time.sleep(0.4)
            js("[...document.querySelectorAll('main tbody tr')].pop().click()"); time.sleep(0.3)
            js("__t.click('Pobierz')")
            dl = wait("__t.has('Pobieranie zakończone')", 90)
            report["download"] = probed and dl and [p.name for p in out.iterdir() if p.suffix == ".mp4"]

        goto("home")
        report["home_recent_jobs_rows"] = js("document.querySelectorAll('main [class*=fui-Badge]').length")
    except Exception:
        report["error"] = traceback.format_exc()
    finally:
        api._detach_window(); time.sleep(0.2); w.destroy()


webview.start(scenario, win, http_server=True)
api._shutdown()
print(json.dumps(report, indent=1, ensure_ascii=False, default=str))
