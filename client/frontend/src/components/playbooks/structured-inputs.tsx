import { useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import yaml from "js-yaml";

// ---------------------------------------------------------------------------
// TagListInput — chip editor for list-of-strings
// ---------------------------------------------------------------------------

export function TagListInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: unknown;
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const items = Array.isArray(value) ? (value as string[]) : [];
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || items.includes(trimmed)) return;
    onChange([...items, trimmed]);
    setDraft("");
  };

  const remove = (index: number) =>
    onChange(items.filter((_, i) => i !== index));

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-9 flex-wrap items-center gap-1 border border-zinc-800 bg-transparent px-2 py-1.5">
        {items.map((item, i) => (
          <Badge
            key={`${item}-${i}`}
            variant="secondary"
            className="gap-1 font-mono text-[11px]"
          >
            {item}
            {!disabled && (
              <button
                type="button"
                className="opacity-50 hover:opacity-100"
                onClick={() => remove(i)}
              >
                <X className="size-2.5" />
              </button>
            )}
          </Badge>
        ))}
        {!disabled && (
          <Input
            ref={inputRef}
            className="h-6 min-w-[120px] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add(draft);
              }
              if (e.key === "Backspace" && !draft && items.length > 0) {
                remove(items.length - 1);
              }
            }}
            onBlur={() => {
              if (draft.trim()) add(draft);
            }}
            placeholder={items.length === 0 ? (placeholder || "Type and press Enter") : ""}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KeyValueEditor — row editor for dict with scalar values
// ---------------------------------------------------------------------------

export function KeyValueEditor({
  value,
  onChange,
  disabled,
}: {
  value: unknown;
  onChange: (v: Record<string, string | number | boolean>) => void;
  disabled?: boolean;
}) {
  const dict: Record<string, string | number | boolean> =
    value != null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, string | number | boolean>)
      : {};

  const entries = Object.entries(dict);

  const update = (oldKey: string, newKey: string, newVal: string) => {
    const next = { ...dict };
    if (oldKey !== newKey) delete next[oldKey];
    const num = Number(newVal);
    next[newKey] = newVal === "true" ? true : newVal === "false" ? false : !isNaN(num) && newVal.trim() !== "" ? num : newVal;
    onChange(next);
  };

  const remove = (key: string) => {
    const next = { ...dict };
    delete next[key];
    onChange(next);
  };

  const addRow = () => {
    const base = "key";
    let candidate = base;
    let n = 1;
    while (candidate in dict) {
      candidate = `${base}_${n++}`;
    }
    onChange({ ...dict, [candidate]: "" });
  };

  return (
    <div className="space-y-1">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            className="min-w-0 flex-1 font-mono text-xs"
            value={k}
            disabled={disabled}
            onChange={(e) => update(k, e.target.value, String(v))}
            placeholder="key"
          />
          <Input
            className="min-w-0 flex-1 font-mono text-xs"
            value={String(v)}
            disabled={disabled}
            onChange={(e) => update(k, k, e.target.value)}
            placeholder="value"
          />
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => remove(k)}
            >
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-zinc-500"
          onClick={addRow}
        >
          <Plus className="size-3" /> Add entry
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// YamlInput — textarea fallback for complex list/dict values
// ---------------------------------------------------------------------------

export function YamlInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const serialize = (v: unknown): string => {
    if (v == null || v === "") return "";
    if (typeof v === "string") return v;
    try {
      return yaml.dump(v, { lineWidth: -1, noRefs: true }).trimEnd();
    } catch {
      return String(v);
    }
  };

  const [text, setText] = useState(() => serialize(value));
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    if (!text.trim()) {
      setError(null);
      onChange(null);
      return;
    }
    try {
      const parsed = yaml.load(text);
      setError(null);
      onChange(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid YAML");
    }
  };

  return (
    <div className="space-y-1">
      <Textarea
        className="min-h-[4.5rem] font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder={placeholder || "YAML / JSON"}
        disabled={disabled}
      />
      {error && (
        <p className="text-[10px] text-red-400">{error}</p>
      )}
    </div>
  );
}
