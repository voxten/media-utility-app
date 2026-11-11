/** Ticks or unticks one playlist entry; with ``range``, every entry from ``anchor`` (the last clicked one) to it. */
export function toggleEntries(
  selected: readonly number[],
  index: number,
  checked: boolean,
  anchor: number | null,
  range: boolean,
): number[] {
  const useRange = range && anchor != null;
  const from = useRange ? Math.min(anchor, index) : index;
  const to = useRange ? Math.max(anchor, index) : index;
  const next = new Set(selected);
  for (let i = from; i <= to; i++) {
    if (checked) next.add(i);
    else next.delete(i);
  }
  return Array.from(next).sort((a, b) => a - b);
}
