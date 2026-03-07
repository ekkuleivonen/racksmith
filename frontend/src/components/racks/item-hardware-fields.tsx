import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
type ItemLike = {
  managed?: boolean;
  name: string;
  host: string;
  ssh_user: string;
  ssh_port: number;
  tags?: string[];
  os?: string;
  os_family?: string | null;
  mac_address?: string;
};

interface ItemHardwareFieldsProps {
  item: ItemLike;
  onChange: (patch: Partial<ItemLike>) => void;
  /** Onboarding mode: hide display name, force managed, labels after connection */
  onboarding?: boolean;
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
  tags,
  labelInput,
  setLabelInput,
  onChange,
  commitLabel,
}: {
  tags: string[];
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
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <div key={tag} className="flex items-center gap-1">
              <Badge variant="outline">{tag}</Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-4 w-4 text-zinc-400 hover:text-zinc-100"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange({
                    tags: tags.filter((existingTag) => existingTag !== tag),
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
          if (e.key === "Backspace" && !labelInput && tags.length > 0) {
            onChange({ tags: tags.slice(0, -1) });
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
}: {
  item: ItemLike;
  onChange: (patch: Partial<ItemLike>) => void;
}) {
  return (
    <>
      <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
        Connection
      </p>
      <Input
        className="h-8 text-xs"
        value={item.host}
        onChange={(e) => onChange({ host: e.target.value })}
        placeholder="Host or SSH alias"
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
          onChange={(e) => onChange({ ssh_port: Number(e.target.value) || 22 })}
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
}: ItemHardwareFieldsProps) {
  const [labelInput, setLabelInput] = useState("");

  const tags = item.tags ?? [];
  const managed = item.managed ?? true;

  useEffect(() => {
    setLabelInput("");
  }, [tags]);

  const commitLabel = () => {
    const nextTags = addLabel(tags, labelInput);
    if (nextTags !== tags) {
      onChange({ tags: nextTags });
    }
    setLabelInput("");
  };

  const labelsSection = (
    <LabelsSection
      tags={tags}
      labelInput={labelInput}
      setLabelInput={setLabelInput}
      onChange={onChange}
      commitLabel={commitLabel}
    />
  );

  const connectionSection = (
    <ConnectionSection item={item} onChange={onChange} />
  );

  if (onboarding) {
    return (
      <div className="space-y-2">
        {connectionSection}
        {labelsSection}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
          Item
        </p>
        <label className="flex items-center gap-2 text-[11px] text-zinc-400">
          <span>Managed</span>
          <Switch
            size="sm"
            checked={managed}
            onCheckedChange={(checked) =>
              onChange({
                managed: checked,
                ...(!checked ? { host: "", ssh_user: "", ssh_port: 22 } : {}),
              })
            }
          />
        </label>
      </div>
      <Input
        className="h-8 text-xs"
        value={item.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder={managed ? "Optional display name" : "Patch panel"}
      />
      {labelsSection}
      {managed ? (
        connectionSection
      ) : (
        <p className="text-[11px] text-zinc-500">
          Visual-only rack element. It will stay out of SSH, sidebar hardware
          links, and device detail pages.
        </p>
      )}
    </div>
  );
}
