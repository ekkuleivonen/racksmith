import type { ComponentType } from "react";
import type { FileViewProps } from "@/components/files/file-types";
import { MdFileView } from "@/components/files/md-file-view";
import { TxtFileView } from "@/components/files/txt-file-view";
import { YamlFileView } from "@/components/files/yaml-file-view";

const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);
const MD_EXTENSIONS = new Set([".md"]);

export function getFileViewForFile(path: string | null): ComponentType<FileViewProps> {
  if (!path) return TxtFileView;

  const lowerPath = path.toLowerCase();
  const extensionIndex = lowerPath.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? lowerPath.slice(extensionIndex) : "";

  if (YAML_EXTENSIONS.has(extension)) return YamlFileView;
  if (MD_EXTENSIONS.has(extension)) return MdFileView;
  return TxtFileView;
}
