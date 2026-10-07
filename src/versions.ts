function parseVersion(value: string): { numbers: number[]; prerelease: string[] } | undefined {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/u.exec(value.trim());
  if (!match) return undefined;
  return {
    numbers: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)],
    prerelease: match[4] === undefined ? [] : match[4].split("."),
  };
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (left === undefined || right === undefined) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  }
  for (let i = 0; i < left.numbers.length; i += 1) {
    if (left.numbers[i] !== right.numbers[i]) return left.numbers[i] > right.numbers[i] ? 1 : -1;
  }
  if (left.prerelease.length === 0 && right.prerelease.length !== 0) return 1;
  if (left.prerelease.length !== 0 && right.prerelease.length === 0) return -1;
  for (let i = 0; i < Math.max(left.prerelease.length, right.prerelease.length); i += 1) {
    const l = left.prerelease[i];
    const r = right.prerelease[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (l === r) continue;
    const ln = /^\d+$/u.test(l) ? Number(l) : undefined;
    const rn = /^\d+$/u.test(r) ? Number(r) : undefined;
    if (ln !== undefined && rn !== undefined) return ln > rn ? 1 : -1;
    if (ln !== undefined) return -1;
    if (rn !== undefined) return 1;
    return l.localeCompare(r);
  }
  return 0;
}

export function newestVersion(versions: readonly string[]): string | undefined {
  return versions.reduce<string | undefined>((best, candidate) => {
    if (best === undefined || compareVersions(candidate, best) > 0) return candidate;
    return best;
  }, undefined);
}
