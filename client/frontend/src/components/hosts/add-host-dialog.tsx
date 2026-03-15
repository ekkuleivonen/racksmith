import { useState, useMemo, useCallback } from "react";
import { Loader2, Plus, Radar, Import, X } from "lucide-react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeviceTable } from "@/components/shared/device-table";
import { createHostsBulk, refreshHost, type HostInput } from "@/lib/hosts";
import { useDiscoveryScan, useHosts } from "@/hooks/queries";
import { useStartScan, useImportDiscoveredHosts } from "@/hooks/mutations";

type HostRow = { ip_address: string; name: string };

interface AddHostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddHostDialog({ open, onOpenChange }: AddHostDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[75vw] w-full max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Hosts</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="manual" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="scanner">Network Scanner</TabsTrigger>
          </TabsList>
          <TabsContent
            value="manual"
            className="flex-1 min-h-[400px] overflow-y-auto"
          >
            <ManualTab onClose={() => onOpenChange(false)} />
          </TabsContent>
          <TabsContent
            value="scanner"
            className="flex-1 min-h-[400px] overflow-y-auto"
          >
            <ScannerTab onClose={() => onOpenChange(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function emptyRow(): HostRow {
  return { ip_address: "", name: "" };
}

function ManualTab({ onClose }: { onClose: () => void }) {
  const [sshUser, setSshUser] = useState("root");
  const [sshPort, setSshPort] = useState(22);
  const [rows, setRows] = useState<HostRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);

  const updateRow = (index: number, patch: Partial<HostRow>) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const validRows = rows.filter((r) => r.ip_address.trim());

  const handleSubmit = async () => {
    if (validRows.length === 0) {
      toast.error("Add at least one IP address");
      return;
    }
    setSaving(true);
    try {
      const hosts: HostInput[] = validRows.map((r) => ({
        name: r.name.trim(),
        ip_address: r.ip_address.trim(),
        ssh_user: sshUser.trim() || "root",
        ssh_port: sshPort,
        managed: true,
        groups: [],
        labels: [],
      }));
      const result = await createHostsBulk(hosts);
      for (const host of result.hosts) {
        refreshHost(host.id).catch(() => {});
      }
      toast.success(
        `${result.hosts.length} host${result.hosts.length !== 1 ? "s" : ""} created`,
      );
      onClose();
    } catch (error) {
      toastApiError(error, "Failed to create hosts");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 py-2">
      <p className="text-xs text-zinc-500">
        Add machines manually. SSH access and OS details will be verified
        automatically.
      </p>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-[11px] text-zinc-500 mb-1 block">
            SSH User
          </label>
          <Input
            className="h-8 text-xs"
            placeholder="root"
            value={sshUser}
            onChange={(e) => setSshUser(e.target.value)}
          />
        </div>
        <div className="w-24">
          <label className="text-[11px] text-zinc-500 mb-1 block">
            SSH Port
          </label>
          <Input
            className="h-8 text-xs"
            type="number"
            value={sshPort}
            onChange={(e) => setSshPort(Number(e.target.value) || 22)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
          Hosts
        </p>
        <div className="space-y-1.5">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                className="h-8 text-xs flex-1 font-mono"
                placeholder="IP address"
                value={row.ip_address}
                onChange={(e) =>
                  updateRow(index, { ip_address: e.target.value })
                }
              />
              <Input
                className="h-8 text-xs flex-1"
                placeholder="Display name (optional)"
                value={row.name}
                onChange={(e) => updateRow(index, { name: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-zinc-500 hover:text-zinc-100"
                disabled={rows.length <= 1}
                onClick={() => removeRow(index)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows((prev) => [...prev, emptyRow()])}
        >
          <Plus className="size-3.5" />
          Add row
        </Button>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={saving || validRows.length === 0}
        >
          {saving
            ? "Creating..."
            : `Create ${validRows.length} host${validRows.length !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );
}

function ScannerTab({ onClose }: { onClose: () => void }) {
  const [scanId, setScanId] = useState<string | null>(null);
  const [subnet, setSubnet] = useState("");
  const [sshUserOverride, setSshUserOverride] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const startScan = useStartScan();
  const importHosts = useImportDiscoveredHosts();
  const { data: scan } = useDiscoveryScan(scanId);
  const { data: existingHosts } = useHosts();

  const defaultSshUser = useMemo(() => {
    if (!existingHosts?.length) return "root";
    const counts = new Map<string, number>();
    for (const h of existingHosts) {
      const u = h.ssh_user?.trim();
      if (u) counts.set(u, (counts.get(u) ?? 0) + 1);
    }
    if (counts.size === 0) return "root";
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }, [existingHosts]);

  const sshUser = sshUserOverride ?? defaultSshUser;

  const isScanning = scan?.status === "pending" || scan?.status === "running";
  const isComplete = scan?.status === "completed";
  const isFailed = scan?.status === "failed";
  const devices = useMemo(() => scan?.devices ?? [], [scan?.devices]);

  const importableDevices = useMemo(
    () => devices.filter((d) => !d.already_imported),
    [devices],
  );

  const handleStartScan = useCallback(() => {
    setSelected(new Set());
    startScan.mutate(subnet || undefined, {
      onSuccess: (data) => setScanId(data.scan_id),
    });
  }, [subnet, startScan]);

  const toggleDevice = useCallback((ip: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip);
      else next.add(ip);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === importableDevices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(importableDevices.map((d) => d.ip)));
    }
  }, [selected.size, importableDevices]);

  const handleImport = useCallback(() => {
    const toImport = devices.filter(
      (d) => selected.has(d.ip) && !d.already_imported,
    );
    if (toImport.length === 0) return;
    importHosts.mutate(
      { devices: toImport, sshUser: sshUser.trim() || "root" },
      {
        onSuccess: () => {
          setSelected(new Set());
          setScanId(null);
          onClose();
        },
      },
    );
  }, [devices, selected, importHosts, sshUser, onClose]);

  return (
    <div className="space-y-4 py-2">
      <p className="text-xs text-zinc-500">
        Scan your local network to find devices and import them as hosts.
      </p>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-[11px] text-zinc-500 mb-1 block">
            Subnet (auto-detected if empty)
          </label>
          <Input
            placeholder="192.168.1.0/24"
            value={subnet}
            onChange={(e) => setSubnet(e.target.value)}
            disabled={isScanning}
          />
        </div>
        <div className="w-28">
          <label className="text-[11px] text-zinc-500 mb-1 block">
            SSH User
          </label>
          <Input
            placeholder="root"
            value={sshUser}
            onChange={(e) => setSshUserOverride(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          onClick={handleStartScan}
          disabled={isScanning || startScan.isPending}
        >
          {isScanning ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Radar className="size-3.5" />
          )}
          {isScanning ? "Scanning..." : "Scan"}
        </Button>
      </div>

      {isScanning && devices.length === 0 && (
        <div className="flex flex-col items-center gap-3 text-zinc-500 py-8">
          <div className="relative">
            <Radar className="size-8 text-zinc-600 animate-pulse" />
            <span className="absolute inset-0 animate-ping rounded-full border border-zinc-700 opacity-30" />
          </div>
          <p className="text-sm">Scanning network...</p>
          {scan?.subnet && (
            <p className="text-xs text-zinc-600">{scan.subnet}</p>
          )}
        </div>
      )}

      {isFailed && (
        <div className="border border-red-900/50 bg-red-950/20 p-3">
          <p className="text-sm text-red-400">
            Scan failed: {scan?.error || "Unknown error"}
          </p>
        </div>
      )}

      {devices.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              {devices.length} device{devices.length !== 1 ? "s" : ""} found
              {scan?.subnet ? ` on ${scan.subnet}` : ""}
              {isScanning && (
                <span className="inline-flex items-center gap-1 ml-2">
                  <Loader2 className="size-3 animate-spin" />
                  <span>scanning...</span>
                </span>
              )}
            </p>
            {isComplete && importableDevices.length > 0 && (
              <Button
                size="sm"
                onClick={handleImport}
                disabled={selected.size === 0 || importHosts.isPending}
              >
                {importHosts.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Import className="size-3" />
                )}
                Import{selected.size > 0 ? ` (${selected.size})` : " Selected"}
              </Button>
            )}
          </div>

          <div className="border border-zinc-800 rounded overflow-auto max-h-[40vh]">
            <DeviceTable
              devices={devices}
              selected={selected}
              onToggle={toggleDevice}
              onToggleAll={toggleAll}
              importableCount={importableDevices.length}
              showCheckboxes={isComplete}
              compact
            />
          </div>
        </div>
      )}

      {isComplete && devices.length === 0 && (
        <div className="text-center py-6">
          <p className="text-zinc-500 text-sm">No devices found</p>
          <p className="text-xs text-zinc-600 mt-1">
            Try a different subnet or check your network connection.
          </p>
        </div>
      )}
    </div>
  );
}

