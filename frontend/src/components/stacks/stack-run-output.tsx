import { RunOutput } from "@/components/shared/run-output";
import {
  getStackRun,
  stackRunStreamUrl,
  type StackRun,
} from "@/lib/stacks";

interface StackRunOutputProps {
  run: StackRun | null;
  onRunUpdate?: (run: StackRun) => void;
}

export function StackRunOutput({ run, onRunUpdate }: StackRunOutputProps) {
  return (
    <RunOutput<StackRun>
      run={run}
      title={(r) => r.stack_name}
      emptyMessage="Run a stack to stream its output here."
      onRunUpdate={onRunUpdate}
      streamUrl={stackRunStreamUrl}
      fetchRun={getStackRun}
    />
  );
}
