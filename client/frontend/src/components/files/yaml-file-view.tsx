import MonacoCode from "@monaco-editor/react";
import type { Monaco } from "@monaco-editor/react";
import type { FileViewProps } from "@/components/files/file-types";

function defineTheme(monaco: Monaco) {
  monaco.editor.defineTheme("racksmith-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0c0c0d",
      "editor.lineHighlightBackground": "#18181b",
      "editorLineNumber.foreground": "#3f3f46",
      "editorLineNumber.activeForeground": "#71717a",
    },
  });
}

export function YamlFileView({
  value,
  onChange,
  readOnly = false,
  height = "calc(100vh - 13rem)",
}: FileViewProps) {
  return (
    <MonacoCode
      height={height}
      defaultLanguage="yaml"
      language="yaml"
      value={value}
      onChange={(next) => onChange(next ?? "")}
      theme="racksmith-dark"
      beforeMount={defineTheme}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        wordWrap: "on",
        automaticLayout: true,
        readOnly,
      }}
    />
  );
}
