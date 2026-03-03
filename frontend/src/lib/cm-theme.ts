import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";

export const cmDarkTheme = [
  EditorView.theme(
    {
      "&": { backgroundColor: "#0c0c0c" },
      ".cm-gutters": { backgroundColor: "#0c0c0c", borderRight: "1px solid #1e1e1e" },
      ".cm-activeLineGutter": { backgroundColor: "#141414" },
      ".cm-activeLine": { backgroundColor: "#141414" },
    },
    { dark: true },
  ),
  syntaxHighlighting(oneDarkHighlightStyle),
];
