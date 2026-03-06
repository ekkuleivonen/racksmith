import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { RackItem } from "@/lib/racks";

type ItemLike = Pick<
  RackItem,
  "managed" | "name" | "host" | "os" | "ssh_user" | "ssh_port" | "tags"
>;

interface ItemHardwareFieldsProps {
  item: ItemLike;
  onChange: (patch: Partial<ItemLike>) => void;
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

export function ItemHardwareFields({ item, onChange }: ItemHardwareFieldsProps) {
  const [labelInput, setLabelInput] = useState("");

  useEffect(() => {
    setLabelInput("");
  }, [item.tags]);

  const commitLabel = () => {
    const nextTags = addLabel(item.tags, labelInput);
    if (nextTags !== item.tags) {
      onChange({ tags: nextTags });
    }
    setLabelInput("");
  };

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
            checked={item.managed}
            onCheckedChange={(checked) =>
              onChange({
                managed: checked,
                ...(!checked
                  ? { host: "", ssh_user: "", ssh_port: 22 }
                  : {}),
              })
            }
          />
        </label>
      </div>
      <Input
        className="h-8 text-xs"
        value={item.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder={item.managed ? "Optional display name" : "Patch panel"}
      />
      <div className="space-y-1">
        <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
          Labels
        </p>
        {item.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.tags.map((tag) => (
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
                    onChange({ tags: item.tags.filter((existingTag) => existingTag !== tag) });
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
            if (e.key === "Backspace" && !labelInput && item.tags.length > 0) {
              onChange({ tags: item.tags.slice(0, -1) });
            }
          }}
          placeholder="Type a label and press Enter"
        />
        <p className="text-[11px] text-zinc-500">
          Press Enter to add a label. Racksmith stores these as host metadata in Ansible.
        </p>
      </div>
      {item.managed ? (
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
            Racksmith will verify SSH access and fetch hostname and OS details automatically.
          </p>
        </>
      ) : (
        <p className="text-[11px] text-zinc-500">
          Visual-only rack element. It will stay out of SSH, sidebar hardware links, and device detail pages.
        </p>
      )}
    </div>
  );
}
