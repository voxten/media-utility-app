// Release notes from CHANGELOG.md / CHANGELOG.pl.md (Keep a Changelog layout), bundled at build time.

import changelogEn from "../../../CHANGELOG.md?raw";
import changelogPl from "../../../CHANGELOG.pl.md?raw";
import type { Language } from "./types";

export interface ChangelogSection {
  title: string;
  items: string[];
}

export interface ChangelogRelease {
  version: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  sections: ChangelogSection[];
}

const SOURCES: Record<Language, string> = { en: changelogEn, pl: changelogPl };

/** Reads "## [1.2.0] - 2026-10-18" releases, their "### Section" headings and "- item" bullets; ignores the rest. */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let section: ChangelogSection | null = null;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const release = /^## \[([^\]]+)\]\s*-\s*(.+)$/.exec(line);
    if (release) {
      releases.push({ version: release[1], date: release[2].trim(), sections: [] });
      section = null;
      continue;
    }
    const current = releases[releases.length - 1];
    if (!current) continue;
    const heading = /^### (.+)$/.exec(line);
    if (heading) {
      section = { title: heading[1].trim(), items: [] };
      current.sections.push(section);
      continue;
    }
    if (!section) continue;
    const item = /^- (.+)$/.exec(line);
    if (item) section.items.push(item[1].trim());
    else if (/^\s+\S/.test(line) && section.items.length) section.items[section.items.length - 1] += ` ${line.trim()}`;
  }
  return releases;
}

const cache = new Map<Language, ChangelogRelease[]>();

export function getChangelog(language: Language): ChangelogRelease[] {
  let releases = cache.get(language);
  if (!releases) {
    releases = parseChangelog(SOURCES[language] || SOURCES.en);
    cache.set(language, releases);
  }
  return releases;
}
