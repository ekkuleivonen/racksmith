import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  useReactFlow,
} from "@xyflow/react";
// dagre removed -- using manual grid layout per subnet
import "@xyflow/react/dist/style.css";
import { Pencil, Check, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toastApiError } from "@/lib/api";
import { useHosts, useSubnets } from "@/hooks/queries";
import { useSelection } from "@/stores/selection";
import { usePingStore } from "@/stores/ping";
import { hostStatusKey } from "@/lib/ssh";
import {
  compareHosts,
  hostDisplayLabel,
  hostSubnetBucket,
  isManagedHost,
  isReachableHost,
  matchesCanvasHostFilters,
  type Host,
} from "@/lib/hosts";
import {
  HostCanvasFloatingMenu,
  type HostCanvasFloatingMenuState,
} from "@/components/canvas/host-context-menu";
import { upsertSubnet, type SubnetMeta } from "@/lib/subnets";
import { invalidateResource } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { CanvasFilters } from "@/hooks/use-canvas-params";

interface NetworkViewProps {
  filters: CanvasFilters;
}

type SubnetSaveFn = (cidr: string, name: string, description: string) => void;
const SubnetSaveContext = createContext<SubnetSaveFn>(() => {});

type HostCanvasMenuOpener = (
  hostId: string,
  label: string,
  clientX: number,
  clientY: number,
) => void;
const HostCanvasMenuContext = createContext<HostCanvasMenuOpener | null>(null);

type HostNodeData = { label: string; ip: string; status: string; multiSelected: boolean };

function HostNode({ id, data }: { id: string; data: HostNodeData }) {
  const openHostMenu = useContext(HostCanvasMenuContext);
  return (
    <div
      className={cn(
        "border bg-zinc-900/90 px-3 py-2 min-w-[140px] transition-colors",
        data.multiSelected
          ? "border-blue-500/60 bg-blue-500/5 shadow-[0_0_6px_rgba(59,130,246,0.15)]"
          : "border-zinc-700 hover:border-zinc-600",
      )}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openHostMenu?.(id, data.label, e.clientX, e.clientY);
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            data.status === "online" && "bg-emerald-400",
            data.status === "offline" && "bg-red-500",
            data.status === "unknown" && "bg-zinc-600",
          )}
        />
        <div className="min-w-0">
          <p className="text-xs text-zinc-100 font-medium truncate">{data.label}</p>
          {data.ip && <p className="text-[10px] text-zinc-500 truncate">{data.ip}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />
    </div>
  );
}

function SubnetNode({ data }: { data: { cidr: string; name: string; description: string } }) {
  const save = useContext(SubnetSaveContext);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.name);
  const [desc, setDesc] = useState(data.description);

  const [prevName, setPrevName] = useState(data.name);
  const [prevDesc, setPrevDesc] = useState(data.description);
  if (prevName !== data.name) {
    setPrevName(data.name);
    if (!editing) setName(data.name);
  }
  if (prevDesc !== data.description) {
    setPrevDesc(data.description);
    if (!editing) setDesc(data.description);
  }

  const handleSave = () => {
    save(data.cidr, name.trim(), desc.trim());
    setEditing(false);
  };

  const handleCancel = () => {
    setName(data.name);
    setDesc(data.description);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  };

  if (editing) {
    return (
      <div
        className="border border-dashed border-zinc-600 bg-zinc-800/60 rounded px-3 py-2 min-w-[200px] space-y-1.5 nodrag"
        onKeyDown={handleKeyDown}
      >
        <Handle type="target" position={Position.Top} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. VLAN10 Mgmt)"
          className="h-6 text-[11px] bg-zinc-900 border-zinc-700 px-1.5"
        />
        <Input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description"
          className="h-6 text-[11px] bg-zinc-900 border-zinc-700 px-1.5"
        />
        <div className="flex gap-1 justify-end">
          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={handleCancel}>
            <X className="size-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-5 w-5 text-emerald-400 hover:text-emerald-300" onClick={handleSave}>
            <Check className="size-3" />
          </Button>
        </div>
        <Handle type="source" position={Position.Bottom} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />
      </div>
    );
  }

  return (
    <div className="group border border-dashed border-zinc-700/50 bg-zinc-800/20 rounded px-3 py-1.5 min-w-[120px]">
      <Handle type="target" position={Position.Top} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          {data.name ? (
            <>
              <p className="text-[11px] text-zinc-300 font-medium truncate">{data.name}</p>
              <p className="text-[10px] text-zinc-500 font-mono">{data.cidr}</p>
            </>
          ) : (
            <p className="text-[10px] text-zinc-500 font-mono">{data.cidr}</p>
          )}
          {data.description && (
            <p className="text-[10px] text-zinc-600 truncate max-w-[180px]">{data.description}</p>
          )}
        </div>
        <button
          type="button"
          className="nodrag opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 hover:text-zinc-300 text-zinc-600"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-3" />
        </button>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  host: HostNode,
  subnet: SubnetNode,
};

const HOST_W = 180;
const HOST_H = 50;
const SUBNET_H = 50;
const COL_GAP = 20;
const ROW_GAP = 16;
const SUBNET_GAP = 60;
const MAX_COLS = 5;
const TOP_PAD = 20;

interface SubnetGroup {
  cidr: string;
  hostIds: string[];
}

function computeGridLayout(
  subnetGroups: SubnetGroup[],
  allNodes: Node[],
): Node[] {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const positioned: Node[] = [];
  let cursorY = 0;

  for (const group of subnetGroups) {
    const cols = Math.min(group.hostIds.length, MAX_COLS);
    const rows = Math.ceil(group.hostIds.length / cols);
    const gridW = cols * HOST_W + (cols - 1) * COL_GAP;
    const subnetW = Math.max(gridW, 200);

    const subnetNode = nodeMap.get(`subnet-${group.cidr}`);
    if (subnetNode) {
      positioned.push({
        ...subnetNode,
        position: { x: (gridW - subnetW) / 2, y: cursorY },
      });
    }

    const hostsStartY = cursorY + SUBNET_H + TOP_PAD;
    group.hostIds.forEach((hostId, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const hostNode = nodeMap.get(hostId);
      if (hostNode) {
        positioned.push({
          ...hostNode,
          position: {
            x: col * (HOST_W + COL_GAP),
            y: hostsStartY + row * (HOST_H + ROW_GAP),
          },
        });
      }
    });

    cursorY = hostsStartY + rows * (HOST_H + ROW_GAP) + SUBNET_GAP;
  }

  return positioned;
}

function NetworkViewInner({ filters }: NetworkViewProps) {
  const { data: allHosts = [] } = useHosts();
  const { data: subnetMetas = [] } = useSubnets();
  const pingStatuses = usePingStore((s) => s.statuses);
  const { fitView } = useReactFlow();
  const multiSelected = useSelection((s) => s.selected);
  const selectionToggle = useSelection((s) => s.toggle);
  const selectionAddMany = useSelection((s) => s.addMany);
  const [floatMenu, setFloatMenu] = useState<HostCanvasFloatingMenuState | null>(null);

  const subnetMetaMap = useMemo(() => {
    const m = new Map<string, SubnetMeta>();
    for (const s of subnetMetas) m.set(s.cidr, s);
    return m;
  }, [subnetMetas]);

  const { mutate: saveSubnet } = useMutation({
    mutationFn: ({
      cidr,
      name,
      description,
      existsInMeta,
    }: {
      cidr: string;
      name: string;
      description: string;
      existsInMeta: boolean;
    }) => upsertSubnet(cidr, { name, description }, existsInMeta),
    onSuccess: () => invalidateResource("subnets"),
    onError: (err) => toastApiError(err, "Failed to save subnet"),
  });

  const handleSubnetSave = useCallback<SubnetSaveFn>(
    (cidr, name, description) =>
      saveSubnet({ cidr, name, description, existsInMeta: subnetMetaMap.has(cidr) }),
    [saveSubnet, subnetMetaMap],
  );

  const hosts = useMemo(() => {
    return allHosts
      .filter(isManagedHost)
      .filter((h) => matchesCanvasHostFilters(h, filters, pingStatuses))
      .sort(compareHosts);
  }, [allHosts, filters, pingStatuses]);

  const openHostContextMenu = useCallback<HostCanvasMenuOpener>(
    (hostId, label, clientX, clientY) => {
      const host = hosts.find((h) => h.id === hostId);
      setFloatMenu({
        x: clientX,
        y: clientY,
        hostId,
        hostLabel: label,
        sshEnabled: host ? isReachableHost(host) : false,
        relocateEnabled: host ? !!host.mac_address : false,
      });
    },
    [hosts],
  );

  // Stable key that only changes when the set of hosts or their subnet
  // membership changes — NOT on status/selection updates.
  const structureKey = useMemo(() => {
    return hosts
      .map((h) => `${h.id}:${hostSubnetBucket(h)}`)
      .sort()
      .join("|");
  }, [hosts]);

  const { layoutNodes: laidOutNodes, layoutEdges } = useMemo(() => {
    const groupMap = new Map<string, Host[]>();
    for (const host of hosts) {
      const subnet = hostSubnetBucket(host);
      if (!groupMap.has(subnet)) groupMap.set(subnet, []);
      groupMap.get(subnet)!.push(host);
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const subnetGroupList: SubnetGroup[] = [];

    for (const [subnet, subnetHosts] of groupMap) {
      const subnetId = `subnet-${subnet}`;
      const meta = subnetMetaMap.get(subnet);
      nodes.push({
        id: subnetId,
        type: "subnet",
        position: { x: 0, y: 0 },
        data: {
          cidr: subnet,
          name: meta?.name ?? "",
          description: meta?.description ?? "",
        },
      });

      const hostIds: string[] = [];
      for (const host of subnetHosts) {
        const status = pingStatuses[hostStatusKey(host.id)] ?? "unknown";
        nodes.push({
          id: host.id,
          type: "host",
          position: { x: 0, y: 0 },
          data: {
            label: hostDisplayLabel(host),
            ip: host.ip_address ?? "",
            status,
            multiSelected: multiSelected.has(host.id),
          },
        });
        edges.push({
          id: `${subnetId}-${host.id}`,
          source: subnetId,
          target: host.id,
          style: { stroke: "#3f3f46", strokeWidth: 1 },
        });
        hostIds.push(host.id);
      }
      subnetGroupList.push({ cidr: subnet, hostIds });
    }

    const positioned = computeGridLayout(subnetGroupList, nodes);
    return { layoutNodes: positioned, layoutEdges: edges };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layout only on structure/meta changes
  }, [structureKey, subnetMetaMap]);

  const [nodes, setNodes, onNodesChange] = useNodesState(laidOutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // Re-layout + fitView only when graph structure changes.
  useEffect(() => {
    setNodes(laidOutNodes);
    setEdges(layoutEdges);
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  }, [laidOutNodes, layoutEdges, setNodes, setEdges, fitView]);

  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        if (node.type === "host") {
          const host = hosts.find((h) => h.id === node.id);
          if (!host) return node;
          const status = pingStatuses[hostStatusKey(host.id)] ?? "unknown";
          const ms = multiSelected.has(host.id);
          const d = node.data as { status: string; multiSelected: boolean };
          if (d.status === status && d.multiSelected === ms) return node;
          return { ...node, data: { ...node.data, status, multiSelected: ms } };
        }
        if (node.type === "subnet") {
          const cidr = (node.data as { cidr: string }).cidr;
          const meta = subnetMetaMap.get(cidr);
          const name = meta?.name ?? "";
          const description = meta?.description ?? "";
          const d = node.data as { name: string; description: string };
          if (d.name === name && d.description === description) return node;
          return { ...node, data: { ...node.data, name, description } };
        }
        return node;
      }),
    );
  }, [pingStatuses, hosts, subnetMetaMap, multiSelected, setNodes]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type !== "host") return;
      selectionToggle(node.id);
    },
    [selectionToggle],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      const hostIds = selectedNodes.filter((n) => n.type === "host").map((n) => n.id);
      if (hostIds.length > 0) selectionAddMany(hostIds);
    },
    [selectionAddMany],
  );

  if (hosts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-1">
          <p className="text-sm text-zinc-400">No hosts found</p>
          <p className="text-xs text-zinc-600">
            {filters.search || filters.groups.length > 0 ? "Try adjusting your filters." : "Add your first host to get started."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <HostCanvasMenuContext.Provider value={openHostContextMenu}>
      <SubnetSaveContext.Provider value={handleSubnetSave}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onSelectionChange={onSelectionChange}
          selectionOnDrag
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-zinc-950"
          minZoom={0.3}
          maxZoom={2}
        >
          <Background color="#27272a" gap={20} size={1} />
        </ReactFlow>
        <HostCanvasFloatingMenu state={floatMenu} onClose={() => setFloatMenu(null)} />
      </SubnetSaveContext.Provider>
    </HostCanvasMenuContext.Provider>
  );
}

export function NetworkView(props: NetworkViewProps) {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <NetworkViewInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
