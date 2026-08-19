export function parentPath(path: string): string {
  const trimmed = path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
  if (trimmed === "/") return "/";
  const index = trimmed.lastIndexOf("/");
  return index <= 0 ? "/" : trimmed.slice(0, index);
}

export function pathSegments(path: string): { name: string; path: string }[] {
  if (path === "/") return [{ name: "/", path: "/" }];
  const parts = path.split("/").filter(Boolean);
  const segments: { name: string; path: string }[] = [{ name: "/", path: "/" }];
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    segments.push({ name: part, path: current });
  }
  return segments;
}
