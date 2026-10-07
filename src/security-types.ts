export interface ArchiveEntryInfo {
  path: string;
  kind: "file" | "directory" | "symlink" | "hardlink";
  compressedSize: number;
  uncompressedSize: number;
}
