import path from "node:path";

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function relativeIdentity(root: string, absolutePath: string): string {
  return toPosixPath(path.relative(root, absolutePath));
}

export function stableCompare(left: string, right: string): number {
  return left.localeCompare(right, "en", { sensitivity: "variant", numeric: false });
}

export function sortByIdentity<T extends { identity: string }>(values: T[]): T[] {
  return [...values].sort((left, right) => stableCompare(left.identity, right.identity));
}

export function displayUserPath(home: string, absolutePath: string): string {
  const relative = path.relative(home, absolutePath);
  if (relative === "") return "~";
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return `~/${toPosixPath(relative)}`;
  }
  return toPosixPath(absolutePath);
}
