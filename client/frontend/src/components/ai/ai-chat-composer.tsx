import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
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
import { cn } from "@/lib/utils";

export type MentionCandidate = {
  type: "host" | "playbook" | "role" | "group" | "rack";
  id: string;
  label: string;
};

type Props = {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  disabled: boolean;
  sending: boolean;
  candidates: MentionCandidate[];
  attachments: MentionCandidate[];
  onAttach: (item: MentionCandidate) => void;
  onDetachLast: () => void;
  onDetach: (item: MentionCandidate) => void;
};

const MENTION_RE = /@([\w.:_-]*)$/;

const TYPE_COLORS: Record<string, string> = {
  host: "text-emerald-400",
  playbook: "text-sky-400",
  role: "text-amber-400",
  group: "text-violet-400",
  rack: "text-rose-400",
};

const CHIP_COLORS: Record<string, string> = {
  host: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200/90",
  playbook: "border-sky-500/30 bg-sky-500/10 text-sky-200/90",
  role: "border-amber-500/30 bg-amber-500/10 text-amber-200/90",
  group: "border-violet-500/30 bg-violet-500/10 text-violet-200/90",
  rack: "border-rose-500/30 bg-rose-500/10 text-rose-200/90",
};

export function AiChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  sending,
  candidates,
  attachments,
  onAttach,
  onDetachLast,
  onDetach,
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
      if (
        e.key === "Backspace" &&
        !mentionOpen &&
        attachments.length > 0 &&
        (textareaRef.current?.selectionStart ?? 0) === 0 &&
        (textareaRef.current?.selectionEnd ?? 0) === 0
      ) {
        e.preventDefault();
        onDetachLast();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !mentionOpen) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend, mentionOpen, attachments.length, onDetachLast],
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
      onAttach(item);
      const before = value.slice(0, mentionStart);
      const after = value.slice(mentionStart + 1 + mentionQuery.length);
      onChange((before + after).replace(/\s+$/, before || after ? " " : ""));
      setMentionOpen(false);
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          const pos = before.length + (before || after ? 1 : 0);
          ta.setSelectionRange(pos, pos);
        }
      });
    },
    [candidates, mentionQuery, mentionStart, onAttach, onChange, value],
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

  const hasChips = attachments.length > 0;
  const canSend = !sending && !disabled && value.trim().length > 0;

  return (
    <Popover open={mentionOpen && filtered.length > 0}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "relative min-w-0 border border-zinc-800 bg-zinc-950/80 transition-colors",
            "focus-within:border-zinc-700",
          )}
        >
          {hasChips && (
            <div className="flex flex-wrap gap-1 px-2.5 pt-2">
              {attachments.map((a) => (
                <span
                  key={`${a.type}:${a.id}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] max-w-[180px]",
                    CHIP_COLORS[a.type],
                  )}
                  title={a.id}
                >
                  <span className="truncate">
                    <span className="opacity-70">@{a.type}</span>
                    <span className="mx-0.5">·</span>
                    {a.label}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 hover:bg-black/20 text-current opacity-60 hover:opacity-100"
                    aria-label={`Remove ${a.label} from context`}
                    onClick={() => onDetach(a)}
                    tabIndex={-1}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about playbooks, roles, hosts, groups… (@ to mention)"
            className={cn(
              "w-full bg-transparent text-[12px] text-zinc-200 placeholder:text-zinc-600",
              "resize-none outline-none border-0",
              "min-h-[44px] max-h-[120px] pl-3 pr-10 py-2.5",
              hasChips && "pt-1.5",
            )}
            disabled={disabled}
            rows={1}
            onInput={(e) => {
              const ta = e.currentTarget;
              ta.style.height = "auto";
              ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
            }}
          />
          <button
            type="button"
            className={cn(
              "absolute right-2 bottom-2 size-7 flex items-center justify-center",
              "rounded transition-colors",
              canSend
                ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                : "text-zinc-600 cursor-default",
            )}
            disabled={!canSend}
            onClick={() => void onSend()}
            aria-label="Send (Enter)"
          >
            {sending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
          </button>
        </div>
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
            {(["host", "playbook", "role", "group", "rack"] as const).map((type) => {
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
