import { cn } from "@/lib/utils";

/* eslint-disable react-refresh/only-export-components -- hostStatusDotClass is a shared util */
const STATUS_CLASSES: Record<string, string> = {
  online: "bg-emerald-400",
  offline: "bg-red-500",
  unknown: "bg-zinc-600",
};

export function hostStatusDotClass(status: string): string {
  return STATUS_CLASSES[status] ?? STATUS_CLASSES.unknown;
}

export function HostStatusDot({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn("size-2 rounded-full", hostStatusDotClass(status), className)}
      title={status}
    />
  );
}
