const React = require('react');
const ReactDOMServer = require('react-dom/server');
const icons = require('@fluentui/react-icons');
const fs = require('fs');

// Unified Document Base for all 5 PDF tools
// Bounding box of document sheet: x=6 to x=20, y=2 to y=20 (width 14, height 18)
// Folded corner at top-right: x=14 to x=20, y=2 to y=8
// Cutout in bottom-left for 11x11 badge (centered at x=6.5, y=17.5, r=5.5)
const DOC_SHEET_REGULAR =
  'M18.5 20a.5.5 0 0 1-.5.5h-5.73a7 7 0 0 1-1.08 1.5H18a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L13.6 2.6c-.37-.37-.9-.59-1.42-.59H6a2 2 0 0 0-2 2v7.5q.71-.3 1.5-.42V4c0-.27.22-.5.5-.5h6V8c0 1.1.9 2 2 2h4.5zm-5-15.38 3.88 3.88H14a.5.5 0 0 1-.5-.5z';

// Badge 1: Merge (two overlapping sheets in corner, or merge icon)
const badgeMergeSheets = `
  <circle cx="6.5" cy="17.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <rect x="3.8" y="14.8" width="4" height="5" rx="0.6" fill="none" stroke="currentColor" stroke-width="1.1"/>
  <path d="M5.5 13.5h2.8a0.6 0.6 0 0 1 0.6 0.6v3.8" fill="none" stroke="currentColor" stroke-width="1.1"/>
`;

const badgeMergeArrows = `
  <circle cx="6.5" cy="17.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <path d="M3.8 15.2l2.7 2.3-2.7 2.3M9.2 15.2l-2.7 2.3 2.7 2.3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
`;

// Badge 2: Compress (ArrowMinimize in circle - approved by user)
const badgeCompress = `
  <circle cx="6.5" cy="17.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <path d="M4.2 15.2h2.3V17.5M8.8 19.8H6.5v-2.3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M4.2 15.2l2.3 2.3m2.3 2.3l-2.3-2.3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
`;

// Badge 3: Split (Scissors in corner - approved by user)
const badgeSplit = `
  <path d="M10.5 13.5L5.5 18.5M10.5 18.5L5.5 13.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="4.2" cy="13.2" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <circle cx="4.2" cy="18.8" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/>
`;

// Badge 4: Convert (Circular sync arrows in matching circle)
const badgeConvert = `
  <circle cx="6.5" cy="17.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <path d="M8.8 15.2a3 3 0 0 0-4.3.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M4.5 14.5v1.4h1.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M4.2 19.8a3 3 0 0 0 4.3-.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M8.5 20.5v-1.4H7.1" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
`;

// Badge 5: Extract (Text lines in matching circle or extraction arrow)
const badgeExtract = `
  <circle cx="6.5" cy="17.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <path d="M4 15.5h5M4 17.5h5M4 19.5h3.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
`;

const badgeExtractArrow = `
  <circle cx="6.5" cy="17.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <path d="M4 16h4M4 19h3M7 14.5l2.5 2.5L7 19.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
`;

function makeSvg(badge) {
  return `<svg fill="currentColor" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="${DOC_SHEET_REGULAR}" fill="currentColor"/>${badge}</svg>`;
}

const unifiedMerge1 = makeSvg(badgeMergeSheets);
const unifiedMerge2 = makeSvg(badgeMergeArrows);
const unifiedCompress = makeSvg(badgeCompress);
const unifiedSplit = makeSvg(badgeSplit);
const unifiedConvert = makeSvg(badgeConvert);
const unifiedExtract1 = makeSvg(badgeExtract);
const unifiedExtract2 = makeSvg(badgeExtractArrow);

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { background: #18181b; color: #fff; font-family: Segoe UI, system-ui, sans-serif; padding: 30px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; margin-bottom: 30px; }
.card { background: #27272a; padding: 14px; border-radius: 8px; border: 1px solid #3f3f46; display: flex; align-items: center; gap: 14px; }
.card.highlight { border-color: #38bdf8; background: #1e293b; }
.icon { width: 38px; height: 38px; display: grid; place-items: center; background: #d9480f; border-radius: 8px; color: #fff; flex-shrink: 0; }
.icon svg { width: 22px; height: 22px; }
.icon.sys { background: #c2851a; }
.title { font-weight: 600; font-size: 14px; }
.desc { font-size: 11px; color: #a1a1aa; }
.badge { display: inline-block; font-size: 10px; background: #38bdf8; color: #000; padding: 1px 6px; border-radius: 4px; font-weight: 700; margin-bottom: 4px; }
</style>
</head>
<body>

<h2>1. Propozycje nowej ikony dla DUPLICATE FINDER (zamiast powtarzać DocumentMultiple)</h2>
<p style="color: #a1a1aa; font-size: 13px;">Duplicate Finder wyszukuje duplikaty plików na dysku. Obecna ikona (DocumentCopy) była niemal identyczna jak DocumentMultiple w PDF Merger. Oto propozycje:</p>
<div class="grid">
  <div class="card highlight">
    <div class="icon sys">${ReactDOMServer.renderToStaticMarkup(React.createElement(icons.FolderSearch24Regular))}</div>
    <div>
      <span class="badge">Rekomendowana 1</span>
      <div class="title">FolderSearch24</div>
      <div class="desc">Folder z lupą – intuicyjne skanowanie katalogów w poszukiwaniu duplikatów</div>
    </div>
  </div>

  <div class="card highlight">
    <div class="icon sys">${ReactDOMServer.renderToStaticMarkup(React.createElement(icons.DocumentSearch24Regular))}</div>
    <div>
      <span class="badge">Rekomendowana 2</span>
      <div class="title">DocumentSearch24</div>
      <div class="desc">Dokument z lupą – wyszukiwanie powielonych dokumentów/plików</div>
    </div>
  </div>

  <div class="card">
    <div class="icon sys">${ReactDOMServer.renderToStaticMarkup(React.createElement(icons.ItemCompare24Regular))}</div>
    <div>
      <div class="title">ItemCompare24</div>
      <div class="desc">Dwa obiekty zestawione obok siebie (porównywanie plików)</div>
    </div>
  </div>

  <div class="card">
    <div class="icon sys">${ReactDOMServer.renderToStaticMarkup(React.createElement(icons.CopySelect24Regular))}</div>
    <div>
      <div class="title">CopySelect24</div>
      <div class="desc">Zaznaczanie i odnajdywanie kopii plików</div>
    </div>
  </div>
</div>

<h2>2. Ujednolicony pakiet PDF – 100% IDENTYCZNY ROZMIAR I SKALA DOKUMENTU</h2>
<p style="color: #a1a1aa; font-size: 13px;">Wszystkie 5 ikonek ma dokładnie ten sam szablon arkusza, tę samą grubość linii i ten sam rozmiar znaczka w lewym dolnym rogu:</p>
<div class="grid">
  <div class="card">
    <div class="icon">${unifiedMerge1}</div>
    <div>
      <div class="title">1. Łączenie PDF (Opcja A)</div>
      <div class="desc">Arkusz PDF + złączone dokumenty w kółku</div>
    </div>
  </div>

  <div class="card">
    <div class="icon">${unifiedMerge2}</div>
    <div>
      <div class="title">1. Łączenie PDF (Opcja B)</div>
      <div class="desc">Arkusz PDF + zbiegające się strzałki scalania</div>
    </div>
  </div>

  <div class="card">
    <div class="icon">${ReactDOMServer.renderToStaticMarkup(React.createElement(icons.DocumentPdf24Regular))}</div>
    <div>
      <div class="title">1. Łączenie PDF (Opcja C - Klasyk)</div>
      <div class="desc">DocumentPdf24 z oficjalnym napisem PDF</div>
    </div>
  </div>

  <div class="card">
    <div class="icon">${unifiedCompress}</div>
    <div>
      <div class="title">2. Kompresja PDF</div>
      <div class="desc">Dokładnie ten sam arkusz + ArrowMinimize w kółku</div>
    </div>
  </div>

  <div class="card">
    <div class="icon">${unifiedSplit}</div>
    <div>
      <div class="title">3. Dzielenie PDF</div>
      <div class="desc">Dokładnie ten sam arkusz + nożyczki w rogu</div>
    </div>
  </div>

  <div class="card">
    <div class="icon">${unifiedConvert}</div>
    <div>
      <div class="title">4. Konwersja PDF (Ujednolicona)</div>
      <div class="desc">Ten sam arkusz + dwustronne strzałki konwersji w kółku (idealnie tej samej skali!)</div>
    </div>
  </div>

  <div class="card">
    <div class="icon">${unifiedExtract1}</div>
    <div>
      <div class="title">5. Ekstrakcja PDF (Wariant Linie)</div>
      <div class="desc">Ten sam arkusz + wyciągane linie tekstu w kółku</div>
    </div>
  </div>

  <div class="card">
    <div class="icon">${unifiedExtract2}</div>
    <div>
      <div class="title">5. Ekstrakcja PDF (Wariant Strzałka)</div>
      <div class="desc">Ten sam arkusz + tekst ze strzałką wyodrębniania</div>
    </div>
  </div>
</div>

<h2>Porównanie: Dotychczasowe ikony wbudowane z Fluent UI (gdzie widać było różnice w skali)</h2>
<div class="grid">
  <div class="card">
    <div class="icon">${ReactDOMServer.renderToStaticMarkup(React.createElement(icons.DocumentSync24Regular))}</div>
    <div>
      <div class="title">Dotychczasowy DocumentSync24</div>
      <div class="desc">Wbudowana ikona konwersji</div>
    </div>
  </div>

  <div class="card">
    <div class="icon">${ReactDOMServer.renderToStaticMarkup(React.createElement(icons.DocumentTextExtract24Regular))}</div>
    <div>
      <div class="title">Dotychczasowy DocumentTextExtract24</div>
      <div class="desc">Wbudowana ikona (szerszy arkusz 16px z długimi liniami)</div>
    </div>
  </div>
</div>

</body>
</html>`;

fs.writeFileSync('preview-icons.html', html);
console.log('preview-icons.html refreshed with unified suite and duplicate finder candidates');
