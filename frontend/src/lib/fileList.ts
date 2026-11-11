/** `list` plus the new `paths`, without duplicates, in the order they were added. */
export function addUnique(list: string[], paths: string[]): string[] {
  return Array.from(new Set([...list, ...paths]));
}

/** Removes the file at `index` and keeps the selection on the same file, or on its neighbour when it was the one removed. */
export function removeFileAt(files: string[], selected: number, index: number): { files: string[]; selected: number } {
  const rest = files.filter((_, i) => i !== index);
  const next = selected > index ? selected - 1 : Math.min(selected, rest.length - 1);
  return { files: rest, selected: Math.max(0, next) };
}
