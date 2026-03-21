import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

export type MentionCandidate = {
  type: "host" | "playbook" | "role" | "rack";
  id: string;
  label: string;
};

type Props = {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  disabled: boolean;
  candidates: MentionCandidate[];
  onMentionSelect: (item: MentionCandidate) => void;
};

const MENTION_RE = /@([\w.:_-]*)$/;

const TYPE_COLORS: Record<string, string> = {
  host: "text-emerald-400",
  playbook: "text-sky-400",
  role: "text-amber-400",
  rack: "text-rose-400",
};

export function AiMentionComposer({
  value,
  onChange,
  onSend,
  disabled,
  candidates,
  onMentionSelect,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      onChange(val);
      const caret = e.target.selectionStart ?? val.length;
      const textBefore = val.slice(0, caret);
      const match = MENTION_RE.exec(textBefore);
      if (match) {
        setMentionOpen(true);
        setMentionQuery(match[1]);
        setMentionStart(caret - match[0].length);
      } else {
        setMentionOpen(false);
      }
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        return;
      }
      if (mentionOpen && e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !mentionOpen) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend, mentionOpen],
  );

  const filtered = useMemo(() => {
    if (!mentionQuery) return candidates;
    const q = mentionQuery.toLowerCase();
    return candidates.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q),
    );
  }, [candidates, mentionQuery]);

  const handleSelect = useCallback(
    (itemValue: string) => {
      const item = candidates.find((c) => `${c.type}:${c.id}` === itemValue);
      if (!item) return;
      onMentionSelect(item);
      const before = value.slice(0, mentionStart);
      const after = value.slice(mentionStart + 1 + mentionQuery.length);
      const token = `@${item.type}:${item.label}`;
      const next = `${before}${token} ${after}`;
      onChange(next);
      setMentionOpen(false);
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          const pos = before.length + token.length + 1;
          ta.focus();
          ta.setSelectionRange(pos, pos);
        }
      });
    },
    [candidates, mentionQuery, mentionStart, onMentionSelect, onChange, value],
  );

  useEffect(() => {
    if (!mentionOpen) return;
    const handler = (e: MouseEvent) => {
      const el = textareaRef.current;
      if (el && !el.contains(e.target as Node)) {
        setMentionOpen(false);
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [mentionOpen]);

  return (
    <Popover open={mentionOpen && filtered.length > 0}>
      <PopoverAnchor asChild>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask about playbooks, roles, hosts… (@ to mention)"
          className="min-h-[48px] max-h-[120px] text-[11px] resize-y bg-zinc-900 border-zinc-800 flex-1"
          disabled={disabled}
        />
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        className="w-64 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList className="max-h-48">
            <CommandEmpty className="text-[10px] text-zinc-500 py-2 text-center">
              No matches
            </CommandEmpty>
            {(["host", "playbook", "role", "rack"] as const).map((type) => {
              const group = filtered.filter((c) => c.type === type);
              if (group.length === 0) return null;
              return (
                <CommandGroup
                  key={type}
                  heading={type.charAt(0).toUpperCase() + type.slice(1) + "s"}
                  className="[&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-zinc-500"
                >
                  {group.map((c) => (
                    <CommandItem
                      key={`${c.type}:${c.id}`}
                      value={`${c.type}:${c.id}`}
                      onSelect={handleSelect}
                      className="text-[11px] py-1 px-2 cursor-pointer"
                    >
                      <span className={`${TYPE_COLORS[c.type]} mr-1.5`}>@{c.type}</span>
                      <span className="truncate">{c.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
