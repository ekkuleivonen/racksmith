import { RunOutput } from "@/components/shared/run-output";
import {
  getPlaybookRun,
  playbookRunStreamUrl,
  type PlaybookRun,
} from "@/lib/playbooks";

interface PlaybookRunOutputProps {
  run: PlaybookRun | null;
  onRunUpdate?: (run: PlaybookRun) => void;
}

export function PlaybookRunOutput({ run, onRunUpdate }: PlaybookRunOutputProps) {
  return (
    <RunOutput<PlaybookRun>
      run={run}
      title={(r) => r.playbook_name}
      emptyMessage="Run a playbook to stream its output here."
      onRunUpdate={onRunUpdate}
      streamUrl={playbookRunStreamUrl}
      fetchRun={getPlaybookRun}
    />
  );
}
