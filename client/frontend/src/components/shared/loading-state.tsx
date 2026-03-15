import { Loader2 } from "lucide-react";

type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
  return (
    <div className="flex h-full items-center justify-center gap-2 p-6 text-zinc-500">
      <Loader2 className="size-4 animate-spin" />
      <span>{message}</span>
    </div>
  );
}
