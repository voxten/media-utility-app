# Przepisanie UI: notatka przekazania (fazy 5–7)

Notatka dla agenta, który kończy migrację Media Utility App z PyQt6 na **pywebview + React + Fluent UI v9**.
Branch roboczy: `feature/modern-ui`. Przeczytaj całość przed zmianami.

Pełny plan pierwotny: `C:\Users\Jakub\.claude\plans\napisz-mi-plan-przepisania-memoized-octopus.md` (może już nie istnieć).

---

## 1. Stan na dziś

| Faza | Status | Commit |
|---|---|---|
| 0: porządki, test pywebview na Py 3.14 | ✅ | `a6d2760` (commit stanu sprzed migracji) |
| 1: logika w `backend/services` + testy | ✅ | `2dc248b` |
| 2: shell pywebview, most Python↔JS, Home, Ustawienia | ✅ | `b14b3a1` |
| 3+4: wspólne komponenty + wszystkie 7 narzędzi | ✅ | `64a1b26` |
| 5: dopracowanie | ✅ (szczegóły w sekcji 5) | `b2a7353` + kolejny commit |
| 6: pakowanie .exe | ✅ (szczegóły w sekcji 6) | commit „Package the app…” |
| **7: sprzątanie starego Qt** | ⏳ do zrobienia | |

Weryfikacja ostatnich faz:
- `pytest`: 41/41 testów zielonych.
- `npm run build` przechodzi.
- `scripts/e2e_ui.py` przeszedł dla converter, pdf, duplicates, watermark, progress i tts.
- Pobieranie wideo: sprawdzenie linku (probe) działa, ale samo pobranie dostało **HTTP 403 od YouTube**. To raczej problem yt-dlp/YouTube niż nowego kodu (logika przeniesiona 1:1), ale nie zostało to potwierdzone.

Stara aplikacja (`app.py` + `features/*/*_tab.py`) **dalej działa i jest nietknięta**. Usuwa się ją dopiero w fazie 7.

---

## 2. Architektura (skrót)

```
main.py                      entry: okno pywebview; --dev ładuje Vite (http://localhost:5173)
backend/
  bridge/api.py              window.pywebview.api.<namespace>.<metoda>; tylko delegacja
  bridge/events.py           EventBus: Python→JS batchowo przez run_js("window.__bridge.emitBatch(...)")
  core/jobs.py               JobManager + JobContext (progress/log/partial/cancel), throttling 10/s
  core/settings.py           %APPDATA%\MediaStudio\settings.json (+ LEGACY_COOKIES fallback)
  core/paths.py              resource_path() działa też po zamrożeniu (sys._MEIPASS)
  core/{thumbs,system,deps,win_theme}.py
  services/{converter,pdf,duplicates,tts,download,watermark,progress_image}.py
frontend/ (React 19 + TS 5.9 + Vite 8 + Fluent UI v9 + zustand + react-i18next + dnd-kit + html-to-image)
  src/lib/bridge.ts          typowane API + on(event) + mock backendu (src/lib/mock.ts) poza pywebview
  src/lib/useJobRunner.ts    start/cancel/callbacki zadania na stronie
  src/stores/jobs.ts         globalny rejestr zadań z eventów job:*
  src/app/{App,Shell,Navigation,tools,theme}.tsx
  src/components/            ActionBar, DropZone, LogPanel, Panel, PathPicker, SettingRow, ...
  src/features/<tool>/       strony narzędzi
  src/i18n/{pl,en}.json
tests/                       pytest dla backendu
scripts/e2e_ui.py            test E2E w prawdziwym oknie (podmienia natywne dialogi w JS)
```

**Przepływ zadania:**
1. Strona woła `api.x.start(...)` i od razu dostaje `jobId`.
2. Backend wysyła eventy `job:started|progress|log|partial|done|error|cancelled`.
3. `stores/jobs.ts` je zbiera, a strona czyta stan przez `useJobRunner(key)`.

**Komunikaty z backendu to klucze i18n**, np. `ctx.progress(50, "converter.status.converting", {"file": name})`. Frontend tłumaczy je przez `t(key, params)`.

---

## 3. Uruchamianie i testy

```bash
.venv/Scripts/python.exe -m pytest                      # backend
cd frontend && npm run dev                              # UI w przeglądarce z mockiem backendu
python main.py --dev                                    # prawdziwe okno + Vite HMR + DevTools
cd frontend && npm run build                            # check-i18n + tsc + vite build → frontend/dist
python main.py                                          # prod: serwuje frontend/dist
python scripts/e2e_ui.py converter pdf                  # E2E (wymaga buildu); bez argumentów = wszystko
```

W `frontend/package.json` są skrypty `check-i18n` i `build`.

Tłumaczenia dodawaj przez `node scripts/merge-i18n.mjs plik.json`, gdzie plik ma postać `{ "pl": {...}, "en": {...} }`.

---

## 4. Pułapki (nauczone na błędach, czytaj!)

**Bezpieczeństwo i pliki użytkownika**
- **Pliki cookies** `features/download/youtube_cookies.txt` i `x.com_cookies.txt`:
  - są w gicie (to znany problem; użytkownik zdecydował „zostaw na razie”);
  - **yt-dlp nadpisuje je przy każdym pobraniu**, bo zapisuje odświeżone cookies.

  Zasady:
  - **nigdy ich nie commituj**;
  - po testach pobierania przywróć je przez `git checkout -- features/download/youtube_cookies.txt`;
  - `x.com_cookies.txt` był zmodyfikowany przez użytkownika **przed** migracją, więc go nie ruszaj.
- Folderów `Assets_Export/`, `HighRes_Survival_UI/`, `ModernSurvival_UI/`, `Modular_Item_Slots/`, `SurvivalUI_Export/`, `venv/`, `qml/`, `controllers/` oraz pliku `video_similarity_report.csv` **nie ruszaj**. Użytkownik wybrał „Nie ruszaj”.

**Frontend / Fluent UI**
- Nie dawaj `className` z wysokością na `FluentProvider`. Portale (toasty, dropdowny) dziedziczą tę klasę i przewijają całą aplikację poza ekran.
- Griffel (`makeStyles`) nie przyjmuje skrótów `borderColor` ani `borderStyle` w zagnieżdżonych selektorach. Używaj `...shorthands.borderColor(x)`.
- Fluent `Dropdown` ma `min-width: 250px`. W wąskich miejscach daj klasę `{ minWidth: 0, width: "100%" }`.
- Komponenty Nav malują tło `colorNeutralBackground4`. W `theme.ts` jest ono nadpisane na kolor bazy okna.
- Selektor zustand zwracający nową tablicę wymaga `useShallow`, inaczej wpadasz w nieskończoną pętlę.
- Polskie liczby mnogie wymagają kluczy `_one/_few/_many/_other`. Brak któregoś daje angielski fallback. Pilnuje tego `npm run check-i18n`.
- Nazwy ikon `@fluentui/react-icons` mają ograniczone rozmiary: np. `ArrowReset` ma 20, a nie 16. Weryfikuj przez `node -e "console.log('X16Regular' in require('@fluentui/react-icons'))"`.
- Celowo **nie** użyto React Router (v8) ani TypeScript 7: są za świeże. Routing robi własny hash-router (`src/lib/router.ts`).

**pywebview**
- `window.evaluate_js` **nie czeka na Promise** (zwraca `{}`). W testach odpytuj DOM w pętli.
- Zagnieżdżone obiekty w `js_api` działają (`api.converter.start`). Atrybuty z `_` nie są wystawiane, więc stan wewnętrzny trzymaj jako `_ctx`.
- Drag & drop:
  - pełne ścieżki daje tylko natywny handler w `main.py` (event `files:dropped`);
  - `lib/drop.ts` kieruje je do strefy, która dostała DOM-owy `drop`.
- Okno przy zamykaniu: `events.closing` odpina EventBus, żeby nie było `ObjectDisposedException`.
- Python 3.14 + pythonnet 3.2 działa (sprawdzone).

**Panel podglądu w Claude Code (Browser pane)**
- `requestAnimationFrame` **nie odpala**, gdy panel jest ukryty. Przez to eksport `html-to-image` wisi **tylko tam**. W prawdziwym oknie działa (sprawdzone E2E).
- Zrzuty ekranu często się zawieszają; ponów albo użyj `get_page_text`.
- Vite HMR potrafił podać nieaktualny moduł `mock.ts`. Gdy mock zachowuje się dziwnie, zrestartuj serwer.

**Git**
- Root `.gitignore` ma regułę `lib/` (z szablonu Pythona). Dodano wyjątek `!frontend/src/lib/`. Uważaj przy nowych katalogach `lib`.
- Ostrzeżenia LF→CRLF są nieszkodliwe.

---

## 5. Faza 5: dopracowanie (ZROBIONE)

Co zostało zrobione:
- **Panel zadań** (`app/JobsPanel.tsx`): OverlayDrawer z prawej, otwierany z pozycji „Zadania” w stopce nawigacji (badge z liczbą trwających) albo z palety.
  - „Wyczyść zakończone” tylko **ukrywa** zadania (`dismissed`); strony narzędzi zachowują swoje wyniki.
- **Toasty dla zadań zakończonych poza stroną narzędzia** (`app/useJobNotifications.ts`). `download.probe` i `pdf.inspect` są wyciszone.
- **Paleta Ctrl+K** (`app/CommandPalette.tsx`): narzędzia, Start, Ustawienia, panel zadań, przełączanie motywu i języka.
- Przycisk lupy w nagłówku nawigacji i w railu.
- **Animacja wejścia strony** (`Shell.tsx`, klasa `page`).
- NavDrawer bez animacji przy starcie (`surfaceMotion={null}`).
- `useNotify` jest zmemoizowany.
- **Znak wodny:** maska jest poszerzana o `MASK_DILATE_PX = 3` (`services/watermark.py`). Jest na to test.
- **Ikona:** `scripts/make_icon.py` generuje `assets/app.ico`, `assets/app.png` i `frontend/public/app.png`.
  - Ikona okna w trybie dev idzie przez `win_theme.set_window_icon` (`WM_SETICON`).
  - Logo w nawigacji to `./app.png`.
- **Mica** (Windows 11 22H2+, build ≥ 22621), ustawienie `mica` (domyślnie `true`):
  - okno tworzone z `transparent=True`;
  - `win_theme.enable_mica`: BackColor formularza = czarny (przez pythonnet `Invoke`), `DwmExtendFrameIntoClientArea(-1)`, `DWMWA_SYSTEMBACKDROP_TYPE=2`;
  - backend wysyła event `app:mica`, a frontend (`stores/ui.ts`) robi przezroczyste tylko `body` i bazę Shell; tokeny `colorNeutralBackground4*` są nadpisane zmiennymi CSS na półprzezroczyste;
  - zmiana przełącznika w Ustawieniach działa po restarcie;
  - sprawdzone zrzutem prawdziwego okna.
  - **Uwaga:** bez czarnego BackColor przezroczyste okno pywebview jest **białe**, a nie przezroczyste.

Pomysły na później (niezrobione):
- historia zadań między uruchomieniami;
- wyraźniejszy wskaźnik zaznaczenia w menu;
- jasny motyw z Mica sprawdzony tylko teoretycznie (DWM wybiera wariant według `DWMWA_USE_IMMERSIVE_DARK_MODE`, który ustawiamy przy zmianie motywu).

---

## 6. Faza 6: pakowanie .exe (ZROBIONE)

```bash
python scripts/build.py                  # npm build → PyInstaller → self-test spoza repo
python scripts/build.py --skip-frontend  # gdy frontend/dist jest aktualny
```

Wynik: `dist/MediaStudio/MediaStudio.exe` (one-folder, **221 MB**).

- Spec: `packaging/MediaStudio.spec`. Ma wyjątek `!packaging/*.spec` w `.gitignore`.
  - `datas`: `frontend/dist`, `assets/app.ico`, `assets/app.png`;
  - ikona exe: `assets/app.ico`;
  - UPX wyłączony (fałszywe alarmy antywirusów);
  - **excludes**: PyQt*, playwright, `features`, **scipy, pywt**, tkinter, matplotlib, pytest.
- **SciPy wycięty** (−73 MB): `services/duplicates.py::phash` to własna implementacja DCT-II (numpy), **bit w bit zgodna** z `imagehash.phash` (test `test_phash_matches_imagehash_reference`).
  - `imagehash` importuje scipy/pywt leniwie, więc nie wolno wołać `imagehash.phash/whash/dhash...`, bo w exe zabraknie scipy.
- **Self-test:** `MediaStudio.exe --selftest raport.json` (`backend/selftest.py`).
  - Sprawdza importy (webview, clr, cv2, fitz, imagehash, pymediainfo, yt_dlp, edge_tts, pyttsx3, pydub, send2trash).
  - Uruchamia offline konwerter, PDF, duplikaty (obrazy), znak wodny, MediaInfo, obecność frontendu i ikony oraz zapis do stdout/stderr.
  - `build.py` odpala go z katalogu tymczasowego.
- `main.ensure_output_streams()`: jeśli `sys.stdout/stderr` są `None` (stare zachowanie trybu `--windowed`), wyjście idzie do `%APPDATA%MediaStudiologsapp.log`.
  - W obecnym PyInstallerze 6.21 + Python 3.14 strumienie istnieją nawet przy uruchomieniu bez uchwytów, co sprawdzono przez `DETACHED_PROCESS`. To zabezpieczenie na przyszłość.
- **Sprawdzone ręcznie:** exe uruchomiony spoza repo pokazuje okno z ikoną i **Mica działa po zamrożeniu**; zamyka się czysto (kod 0).
- **Niesprawdzone w exe:** TTS (Edge/pyttsx3), pobieranie, skan duplikatów **wideo** (cv2 + ffmpeg DLL z opencv) i eksport PNG generatora. Kod jest ten sam co w trybie źródłowym, gdzie to działa.
- **ffmpeg nie jest bundlowany**, bo jest potrzebny tylko yt-dlp/pydub. Brak widać w Ustawieniach → Zależności.
- WebView2 Runtime jest wbudowany w Windows 11; na Windows 10 może wymagać instalacji (do README).
- `dist/` zawiera też **stare** buildy użytkownika (`dist/MediaUtilityApp`, `dist/app.exe`), których nie ruszano.
- Do zrobienia opcjonalnie: zasób wersji pliku exe (`version=` w EXE), instalator (Inno Setup / MSIX).

---

## 7. Faza 7: sprzątanie (do zrobienia, najpierw zapytaj użytkownika)

1. Usuń `app.py` i stare zakładki Qt:
   - `features/converter/converter_tab.py`
   - `features/pdf_merger/pdf_merger.py`
   - `features/duplicates/{video,image}_duplicate_tab.py`
   - `features/tts/tts_tab.py`
   - `features/download/yt_tab.py`
   - `features/watermark/watermark_remover_tab.py`
   - `features/progress_generator/progress_generator_tab.py` + `index.html` + `style.css` (wygląd jest przeniesiony do `frontend/src/features/progress/ProgressCard.tsx`)
2. **Uwaga na `features/download/`:** `backend/core/settings.py::LEGACY_COOKIES` czyta stamtąd cookies jako fallback.
   - Nie usuwaj plików cookies bez decyzji użytkownika.
   - Najlepiej: zaproponuj ustawienie ścieżek w Ustawieniach → Pliki cookies, a dopiero potem usuń fallback.
   - Przypomnij, że cookies były w historii gita, więc sesje YouTube/X warto wylogować.
3. **Przed usunięciem zapytaj o:**
   - `features/ui_generator/` (generatory sprite'ów Survival UI; nie są używane przez aplikację);
   - `features/duplicates/folder_checker.py` (luźny skrypt CLI).
4. Po usunięciu katalog `features/` może zniknąć cały. Wtedy sprawdź, czy nic nie importuje `features.*`: `backend/` nie importuje; jedyna zależność to `LEGACY_COOKIES`.
5. `requirements.txt`: usuń `PyQt6`, `playwright`, `pypdf` (nieużywany, PDF robi PyMuPDF). Sprawdź `qtgui`/`qtwidgets` w `.venv` (śmieci).
6. Nowy `README.md`: instalacja (`pip install -r requirements-dev.txt`, `npm ci`), dev (`npm run dev` + `python main.py --dev`), build (`python scripts/build.py`), testy.
7. Po wszystkim: `pytest`, `npm run build`, `python scripts/e2e_ui.py`, zbudowany exe uruchomiony z innego katalogu. Potem commit.

---

## 8. Ustalenia z użytkownikiem

- Technologia: pywebview + React + Fluent UI v9.
- Wygląd: Windows 11 Fluent.
- Motyw jasny/ciemny/systemowy, języki PL/EN.
- Cookies: na razie zostają w repo, nie ruszać.
- Śmieciowe foldery: nie ruszać.
- Commity po każdej fazie na `feature/modern-ui`. Bez pushowania i PR, chyba że użytkownik poprosi.
- Commity kończą się linią `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
