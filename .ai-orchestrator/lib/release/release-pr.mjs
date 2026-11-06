// The pure parts of the last step of /ao-ship vX.Y.0 (release-workflow spec 2.7): the result of the regression report,
// and CHANGELOG.md with the section of the release.

// The line "Result: PASS" or "Result: FAIL" that qa ends the Regression Result section with; null without one.
export function regressionResult(text) {
  return /^Result:\s*(PASS|FAIL)\b/m.exec(text ?? '')?.[1] ?? null;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// `current`: CHANGELOG.md, or null when there is none. The section goes under its title, before the older releases; a
// changelog that has a heading of the release already is returned as it is.
export function changelogWith(current, section, version) {
  const body = `${section.trim()}\n`;
  if (current === null) return `# Changelog\n\n${body}`;
  if (new RegExp(`^##\\s+\\[?${escape(version)}\\]?(\\s|$)`, 'm').test(current)) return current;
  const title = /^# .*\n(\n)?/.exec(current);
  if (!title || title.index !== 0) return `${body}\n${current}`;
  return `${current.slice(0, title[0].length)}${title[1] ? '' : '\n'}${body}\n${current.slice(title[0].length)}`;
}
