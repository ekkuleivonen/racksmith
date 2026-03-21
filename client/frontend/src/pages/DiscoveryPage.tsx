import { useState, useMemo, useCallback } from "react";
import { Loader2, Radar, Import } from "lucide-react";
import { SSH_PORT_FALLBACK } from "@/lib/defaults";
import { useDefaults, useDiscoveryScan, useHosts } from "@/hooks/queries";
import { useStartScan, useImportDiscoveredHosts } from "@/hooks/mutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeviceTable } from "@/components/shared/device-table";
import { PageContainer } from "@/components/shared/page-container";

export function DiscoveryPage() {
  const [scanId, setScanId] = useState<string | null>(null);
  const [subnet, setSubnet] = useState("");
  const [sshUserOverride, setSshUserOverride] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const startScan = useStartScan();
  const importHosts = useImportDiscoveredHosts();
  const { data: scan } = useDiscoveryScan(scanId);
  const { data: existingHosts } = useHosts();
  const { data: defaults } = useDefaults();

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

  const isScanning =
    scan?.status === "pending" || scan?.status === "running";
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
      {
        devices: toImport,
        sshUser: sshUser.trim() || "root",
        sshPort: defaults?.ssh_port ?? SSH_PORT_FALLBACK,
      },
      {
        onSuccess: () => {
          setSelected(new Set());
          setScanId(null);
        },
      },
    );
  }, [defaults?.ssh_port, devices, selected, importHosts, sshUser]);

  return (
    <PageContainer>
        {/* Header */}
        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-zinc-100 font-semibold">
                Network Discovery
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Scan your local network to find devices. Import discovered
                devices as hosts.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-end gap-2">
            <div className="flex-1 max-w-xs">
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
            <div className="w-36">
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
              onClick={handleStartScan}
              disabled={isScanning || startScan.isPending}
            >
              {isScanning ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Radar className="size-3.5" />
              )}
              {isScanning ? "Scanning..." : "Scan Network"}
            </Button>
          </div>
        </section>

        {/* Scanning state */}
        {isScanning && devices.length === 0 && (
          <section className="border border-zinc-800 bg-zinc-900/30 p-8">
            <div className="flex flex-col items-center gap-3 text-zinc-500">
              <div className="relative">
                <Radar className="size-8 text-zinc-600 animate-pulse" />
                <span className="absolute inset-0 animate-ping rounded-full border border-zinc-700 opacity-30" />
              </div>
              <p className="text-sm">Scanning network...</p>
              {scan?.subnet && (
                <p className="text-xs text-zinc-600">{scan.subnet}</p>
              )}
            </div>
          </section>
        )}

        {/* Error state */}
        {isFailed && (
          <section className="border border-red-900/50 bg-red-950/20 p-4">
            <p className="text-sm text-red-400">
              Scan failed: {scan?.error || "Unknown error"}
            </p>
          </section>
        )}

        {/* Results table */}
        {devices.length > 0 && (
          <section className="border border-zinc-800 bg-zinc-900/30">
            <div className="flex items-center justify-between p-4 pb-0">
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
                  Import {selected.size > 0 ? `(${selected.size})` : "Selected"}
                </Button>
              )}
            </div>

            <div className="p-4 pt-3">
              <DeviceTable
                devices={devices}
                selected={selected}
                onToggle={toggleDevice}
                onToggleAll={toggleAll}
                importableCount={importableDevices.length}
                showCheckboxes={isComplete}
              />
            </div>
          </section>
        )}

        {/* Empty completed state */}
        {isComplete && devices.length === 0 && (
          <section className="border border-zinc-800 bg-zinc-900/30 p-6 text-center">
            <p className="text-zinc-500 text-sm">No devices found</p>
            <p className="text-xs text-zinc-600 mt-1">
              Try a different subnet or check your network connection.
            </p>
          </section>
        )}
    </PageContainer>
  );
}

