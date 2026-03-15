import MonacoCode from "@monaco-editor/react";
import type { FileViewProps } from "@/components/files/file-types";

export function TxtFileView({
  value,
  onChange,
  readOnly = false,
  height = "calc(100vh - 13rem)",
}: FileViewProps) {
  return (
    <MonacoCode
      height={height}
      defaultLanguage="plaintext"
      language="plaintext"
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
