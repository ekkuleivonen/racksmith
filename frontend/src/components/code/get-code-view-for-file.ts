import type { ComponentType } from "react";
import type { CodeViewProps } from "@/components/code/code-types";
import { MdCodeView } from "@/components/code/md-code-view";
import { TxtCodeView } from "@/components/code/txt-code-view";
import { YamlCodeView } from "@/components/code/yaml-code-view";

const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);
const MD_EXTENSIONS = new Set([".md"]);

export function getCodeViewForFile(path: string | null): ComponentType<CodeViewProps> {
  if (!path) return TxtCodeView;

  const lowerPath = path.toLowerCase();
  const extensionIndex = lowerPath.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? lowerPath.slice(extensionIndex) : "";

  if (YAML_EXTENSIONS.has(extension)) return YamlCodeView;
  if (MD_EXTENSIONS.has(extension)) return MdCodeView;
  return TxtCodeView;
}
