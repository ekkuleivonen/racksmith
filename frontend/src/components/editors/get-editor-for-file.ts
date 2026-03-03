import type { ComponentType } from "react";
import type { CodeEditorProps } from "@/components/editors/editor-types";
import { MdEditor } from "@/components/editors/md-editor";
import { TxtEditor } from "@/components/editors/txt-editor";
import { YamlEditor } from "@/components/editors/yaml-editor";

const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);
const MD_EXTENSIONS = new Set([".md"]);

export function getEditorForFile(path: string | null): ComponentType<CodeEditorProps> {
  if (!path) return TxtEditor;

  const lowerPath = path.toLowerCase();
  const extensionIndex = lowerPath.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? lowerPath.slice(extensionIndex) : "";

  if (YAML_EXTENSIONS.has(extension)) return YamlEditor;
  if (MD_EXTENSIONS.has(extension)) return MdEditor;
  return TxtEditor;
}
