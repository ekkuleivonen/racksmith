import { useMemo, useState } from "react";
import { SSH_PORT_FALLBACK } from "@/lib/defaults";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type ItemLike = {
  name?: string;
  ip_address: string;
  ssh_user: string;
  ssh_port: number;
  labels?: string[];
  os?: string;
  os_family?: string | null;
  mac_address?: string;
};

interface ItemHardwareFieldsProps {
  item: ItemLike;
  onChange: (patch: Partial<ItemLike>) => void;
  /** Onboarding mode: simplified layout, labels after connection */
  onboarding?: boolean;
  /** Fallback when port field is cleared */
  defaultSshPort?: number;
}

function normalizeLabel(value: string): string {
  return value.trim();
}

function addLabel(existing: string[], value: string): string[] {
  const next = normalizeLabel(value);
  if (!next || existing.includes(next)) {
    return existing;
  }
  return [...existing, next];
}

function LabelsSection({
  labels,
  labelInput,
  setLabelInput,
  onChange,
  commitLabel,
}: {
  labels: string[];
  labelInput: string;
  setLabelInput: (v: string) => void;
  onChange: (patch: Partial<ItemLike>) => void;
  commitLabel: () => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
        Labels
      </p>
      {labels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {labels.map((label) => (
            <div key={label} className="flex items-center gap-1">
              <Badge variant="outline">{label}</Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-4 w-4 text-zinc-400 hover:text-zinc-100"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange({
                    labels: labels.filter((existing) => existing !== label),
                  });
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <Input
        className="h-8 text-xs"
        value={labelInput}
        onChange={(e) => setLabelInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitLabel();
          }
          if (e.key === "Backspace" && !labelInput && labels.length > 0) {
            onChange({ labels: labels.slice(0, -1) });
          }
        }}
        placeholder="Type a label and press Enter"
      />
    </div>
  );
}

function ConnectionSection({
  item,
  onChange,
  defaultSshPort,
}: {
  item: ItemLike;
  onChange: (patch: Partial<ItemLike>) => void;
  defaultSshPort: number;
}) {
  return (
    <>
      <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
        Connection
      </p>
      <Input
        className="h-8 text-xs"
        value={item.ip_address}
        onChange={(e) => onChange({ ip_address: e.target.value })}
        placeholder="IP address"
      />
      <div className="flex gap-2">
        <Input
          className="h-8 text-xs flex-1"
          value={item.ssh_user}
          onChange={(e) => onChange({ ssh_user: e.target.value })}
          placeholder="SSH user"
        />
        <Input
          className="h-8 text-xs w-20"
          type="number"
          value={item.ssh_port}
          onChange={(e) =>
            onChange({ ssh_port: Number(e.target.value) || defaultSshPort })
          }
          placeholder="Port"
        />
      </div>
      <p className="text-[11px] text-zinc-500">
        Racksmith will verify SSH access and fetch hostname and OS details
        automatically.
      </p>
    </>
  );
}

export function ItemHardwareFields({
  item,
  onChange,
  onboarding = false,
  defaultSshPort = SSH_PORT_FALLBACK,
}: ItemHardwareFieldsProps) {
  const [labelInput, setLabelInput] = useState("");

  const labels = useMemo(() => item.labels ?? [], [item.labels]);

  const commitLabel = () => {
    const nextLabels = addLabel(labels, labelInput);
    if (nextLabels !== labels) {
      onChange({ labels: nextLabels });
    }
    setLabelInput("");
  };

  const labelsSection = (
    <LabelsSection
      labels={labels}
      labelInput={labelInput}
      setLabelInput={setLabelInput}
      onChange={onChange}
      commitLabel={commitLabel}
    />
  );

  const connectionSection = (
    <ConnectionSection
      item={item}
      onChange={onChange}
      defaultSshPort={defaultSshPort}
    />
  );

  if (onboarding) {
    return (
      <div className="space-y-2">
        <Input
          className="h-8 text-xs"
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Optional display name"
        />
        {connectionSection}
        {labelsSection}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
        Host
      </p>
      <Input
        className="h-8 text-xs"
        value={item.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Optional display name"
      />
      {labelsSection}
      {connectionSection}
    </div>
  );
}
