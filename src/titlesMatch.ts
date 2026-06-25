export function titlesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalize(a) === normalize(b);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s._]+/g, ".");
}
