import MonacoCode from "@monaco-editor/react";
import type { CodeViewProps } from "@/components/code/code-types";

export function YamlCodeView({
  value,
  onChange,
  readOnly = false,
  height = "calc(100vh - 13rem)",
}: CodeViewProps) {
  return (
    <MonacoCode
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
