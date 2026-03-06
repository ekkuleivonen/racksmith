import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { RackItem } from "@/lib/racks";

type ItemLike = Pick<
  RackItem,
  "managed" | "name" | "hardware_type" | "host" | "os" | "ssh_user" | "ssh_port" | "tags"
>;

interface ItemHardwareFieldsProps {
  item: ItemLike;
  onChange: (patch: Partial<ItemLike>) => void;
}

export function ItemHardwareFields({ item, onChange }: ItemHardwareFieldsProps) {
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
