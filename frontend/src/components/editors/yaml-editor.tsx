import Editor from "@monaco-editor/react";
import type { CodeEditorProps } from "@/components/editors/editor-types";

export function YamlEditor({
  value,
  onChange,
  readOnly = false,
  height = "calc(100vh - 13rem)",
}: CodeEditorProps) {
  return (
    <Editor
      height={height}
      defaultLanguage="yaml"
      language="yaml"
      value={value}
      onChange={(next) => onChange(next ?? "")}
      theme="vs-dark"
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
