import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')
        ? [path]
        : [];
  });
}

describe('Checkpoint 4 source guardrails', () => {
  const source = sourceFiles(join(process.cwd(), 'app'))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

  it('does not restore locale-sensitive business hardcodes', () => {
    expect(source).not.toMatch(/uiLocales\s*:\s*[']DE[']/);
    expect(source).not.toMatch(/Intl\.NumberFormat\(['](?:de-DE|en-US)[']/);
    expect(source).not.toMatch(/Intl\.DateTimeFormat\(['](?:de-DE|en-US)[']/);
    expect(source).not.toMatch(/CartForm[\s\S]{0,250}route=[']\/cart[']/);
  });

  it('keeps the wishlist resource route language-neutral', () => {
    expect(source).not.toContain('/en/api/wishlist');
  });
});
