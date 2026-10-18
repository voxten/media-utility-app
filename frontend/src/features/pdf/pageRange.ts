// Page range strings ("1-3, 5") ↔ 0-based page indexes; parsing mirrors backend/services/pdf.py.

export function parsePageRange(spec: string, total: number): number[] {
  const pages: number[] = [];
  const add = (oneBased: number) => {
    const index = oneBased - 1;
    if (index >= 0 && index < total && !pages.includes(index)) pages.push(index);
  };
  for (const raw of spec.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    const [a, b] = part.split("-", 2).map((s) => Number.parseInt(s.trim(), 10));
    if (part.includes("-")) {
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      for (let p = Math.max(1, a); p <= Math.min(total, b); p++) add(p);
    } else if (!Number.isNaN(a)) add(a);
  }
  return pages;
}

/** Shortest range string for a set of 0-based pages, e.g. [0, 1, 2, 4] → "1-3, 5". */
export function formatPageRange(pages: Iterable<number>): string {
  const sorted = Array.from(new Set(pages)).sort((x, y) => x - y);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? `${start + 1}` : `${start + 1}-${sorted[i] + 1}`);
  }
  return parts.join(", ");
}
