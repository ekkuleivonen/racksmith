import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function DetailLoading({ message }: { message: string }) {
  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <p className="text-zinc-500 text-sm">{message}</p>
    </div>
  );
}

interface DetailNotFoundProps {
  title: string;
  description: string;
  backPath: string;
  backLabel: string;
}

export function DetailNotFound({ title, description, backPath, backLabel }: DetailNotFoundProps) {
  const navigate = useNavigate();
  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="space-y-1">
          <h1 className="text-zinc-100 font-semibold">{title}</h1>
          <p className="text-sm text-zinc-500">{description}</p>
        </div>
        <Button size="sm" onClick={() => navigate(backPath)}>
          {backLabel}
        </Button>
      </div>
    </div>
  );
}
