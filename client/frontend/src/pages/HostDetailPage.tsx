import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  EditableConnectionSection,
  EditableGroupsSection,
  EditableLabelsSection,
  EditableNameSection,
  EditableVarsSection,
  HostActions,
  PingBadge,
} from "@/components/canvas/host-detail-panel";
import { DetailLoading, DetailNotFound } from "@/components/shared/detail-states";
import { PageContainer } from "@/components/shared/page-container";
import { useGroups, useHost, usePingStatus } from "@/hooks/queries";
import { hostDisplayLabel } from "@/lib/hosts";

export function HostDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: host, isLoading } = useHost(id || undefined);
  const pingStatus = usePingStatus(id || undefined);
  const { data: allGroups = [] } = useGroups();

  if (isLoading) {
    return <DetailLoading message="Loading host..." />;
  }

  if (!host || !host.managed) {
    return (
      <DetailNotFound
        title="Host not found"
        description="This host does not exist or is not managed."
        backPath="/"
        backLabel="Back to hosts"
      />
    );
  }

  return (
    <PageContainer>
      <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-zinc-100 font-semibold truncate">
              {hostDisplayLabel(host)}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <PingBadge status={pingStatus.data ?? "unknown"} />
              {host.placement ? (
                <span className="text-[10px] text-zinc-500">
                  {host.placement.u_height ?? 1}U @ col{" "}
                  {(host.placement.col_start ?? 0) + 1}
                </span>
              ) : null}
              {host.ip_address ? (
                <span className="text-[11px] text-zinc-500 font-mono">{host.ip_address}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("/")}>
              Back to hosts
            </Button>
            <HostActions
              host={host}
              onClose={() => navigate("/")}
              showCloseButton={false}
              onDeleted={() => navigate("/")}
            />
          </div>
        </div>
        {(host.os_family || (host.labels ?? []).length > 0) && (
          <div className="flex flex-wrap gap-1">
            {host.os_family ? (
              <Badge variant="outline" className="text-[10px]">
                {host.os_family}
              </Badge>
            ) : null}
          </div>
        )}
      </section>

      <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
        <EditableNameSection host={host} />
      </section>

      <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
        <EditableConnectionSection host={host} />
      </section>

      <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
        <EditableLabelsSection host={host} />
      </section>

      <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
        <EditableGroupsSection host={host} allGroups={allGroups} />
      </section>

      <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
        <h2 className="text-sm font-medium text-zinc-400 mb-2">Variables</h2>
        <Separator className="mb-3 bg-zinc-800" />
        <EditableVarsSection key={host.id} host={host} />
      </section>
    </PageContainer>
  );
}
