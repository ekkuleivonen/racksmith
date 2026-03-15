import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DiscoveredDevice } from "@/lib/discovery";

export function Dim({ children = "—" }: { children?: React.ReactNode }) {
  return <span className="text-zinc-600">{children}</span>;
}

interface DeviceTableProps {
  devices: DiscoveredDevice[];
  selected: Set<string>;
  onToggle: (ip: string) => void;
  onToggleAll: () => void;
  importableCount: number;
  showCheckboxes: boolean;
  compact?: boolean;
}

export function DeviceTable({
  devices,
  selected,
  onToggle,
  onToggleAll,
  importableCount,
  showCheckboxes,
  compact,
}: DeviceTableProps) {
  const allSelected =
    importableCount > 0 && selected.size === importableCount;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showCheckboxes && (
            <TableHead className="w-8">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleAll}
                aria-label="Select all"
              />
            </TableHead>
          )}
          <TableHead className={compact ? "text-xs" : undefined}>IP Address</TableHead>
          {compact ? (
            <>
              <TableHead className="text-xs">Vendor</TableHead>
              <TableHead className="text-xs">MAC</TableHead>
            </>
          ) : (
            <>
              <TableHead>MAC Address</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Hostname</TableHead>
            </>
          )}
          <TableHead className={compact ? "text-xs" : undefined}>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {devices.map((device) => (
          <TableRow key={device.ip}>
            {showCheckboxes && (
              <TableCell className={compact ? "py-1.5" : undefined}>
                {device.already_imported ? (
                  <Checkbox checked disabled aria-label="Already imported" />
                ) : (
                  <Checkbox
                    checked={selected.has(device.ip)}
                    onCheckedChange={() => onToggle(device.ip)}
                    aria-label={`Select ${device.ip}`}
                  />
                )}
              </TableCell>
            )}
            <TableCell className={compact ? "font-mono text-xs py-1.5" : "font-mono"}>
              {device.ip}
            </TableCell>
            {compact ? (
              <>
                <TableCell className="text-xs py-1.5 truncate max-w-[200px]">
                  {device.vendor || <Dim />}
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-500 py-1.5">
                  {device.mac}
                </TableCell>
              </>
            ) : (
              <>
                <TableCell className="font-mono text-zinc-500">
                  {device.mac}
                </TableCell>
                <TableCell>{device.vendor || <Dim>—</Dim>}</TableCell>
                <TableCell>{device.hostname || <Dim>—</Dim>}</TableCell>
              </>
            )}
            <TableCell className={compact ? "py-1.5" : undefined}>
              {device.already_imported ? (
                <Badge variant="secondary" className={compact ? "text-[10px]" : undefined}>
                  Imported
                </Badge>
              ) : (
                <Badge variant="outline" className={compact ? "text-[10px]" : undefined}>
                  Available
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
