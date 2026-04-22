export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function hasInList(csv: string | undefined | null, val: string) {
  if (!csv) return false;
  return csv.split(",").map(s => s.trim()).includes(val);
}

export function toggleInList(csv: string | undefined | null, val: string) {
  const list = csv ? csv.split(",").map(s => s.trim()).filter(Boolean) : [];
  if (list.includes(val)) return list.filter(s => s !== val).join(", ");
  return [...list, val].join(", ");
}
