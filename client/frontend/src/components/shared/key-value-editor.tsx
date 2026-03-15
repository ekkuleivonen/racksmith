import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { VarRow, VarType } from "./key-value-editor-utils";

export type KeyValueEditorProps = {
  rows: VarRow[];
  onChange: (rows: VarRow[]) => void;
  readonlyKeys?: Set<string>;
  emptyMessage?: string;
};

function convertValue(
  current: string | number | boolean,
  to: VarType,
): string | number | boolean {
  switch (to) {
    case "number": {
      const n = Number(current);
      return Number.isFinite(n) ? n : 0;
    }
    case "bool":
      return current === true || current === "true" || current === 1;
    case "string":
      return String(current);
  }
}

const TYPE_LABELS: Record<VarType, string> = {
  string: "Abc",
  number: "123",
  bool: "T/F",
};

function ValueWidget({
  row,
  disabled,
  onChange,
}: {
  row: VarRow;
  disabled: boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  switch (row.type) {
    case "bool":
      return (
        <div className="flex items-center h-8 px-2">
          <Switch
            checked={!!row.value}
            onCheckedChange={(checked) => onChange(checked)}
            disabled={disabled}
          />
          <span className="ml-2 text-xs text-zinc-400">
            {row.value ? "true" : "false"}
          </span>
        </div>
      );
    case "number":
      return (
        <Input
          type="number"
          value={typeof row.value === "number" ? row.value : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          disabled={disabled}
          placeholder="0"
          className="h-8 text-sm"
        />
      );
    default:
      return (
        <Input
          value={String(row.value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="value"
          className="h-8 text-sm"
        />
      );
  }
}

export function KeyValueEditor({
  rows,
  onChange,
  readonlyKeys,
  emptyMessage = "No variables defined.",
}: KeyValueEditorProps) {
  const updateRow = (index: number, patch: Partial<VarRow>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  const addRow = () => {
    onChange([...rows, { key: "", value: "", type: "string" }]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-400">Variables</h2>
        <Button size="sm" variant="outline" onClick={addRow}>
          <Plus className="size-3.5 mr-1" /> Add variable
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="border border-zinc-800 bg-zinc-900/30 p-4">
          <p className="text-zinc-500 text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_80px_1fr_auto] gap-2 px-1 pb-1">
            <span className="text-xs text-zinc-500 font-medium">Key</span>
            <span className="text-xs text-zinc-500 font-medium">Type</span>
            <span className="text-xs text-zinc-500 font-medium">Value</span>
            <span className="w-7" />
          </div>
          {rows.map((row, i) => {
            const locked = readonlyKeys?.has(row.key);
            return (
              <div
                key={i}
                className="grid grid-cols-[1fr_80px_1fr_auto] gap-2 items-center"
              >
                <Input
                  value={row.key}
                  onChange={(e) => updateRow(i, { key: e.target.value })}
                  disabled={!!locked}
                  placeholder="variable_name"
                  className="h-8 text-sm font-mono"
                />
                <Select
                  value={row.type}
                  onValueChange={(t) => {
                    const newType = t as VarType;
                    updateRow(i, {
                      type: newType,
                      value: convertValue(row.value, newType),
                    });
                  }}
                  disabled={!!locked}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABELS) as VarType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ValueWidget
                  row={row}
                  disabled={!!locked}
                  onChange={(value) => updateRow(i, { value })}
                />
                {locked ? (
                  <span className="w-7" />
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                    onClick={() => removeRow(i)}
                    aria-label="Remove variable"
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
