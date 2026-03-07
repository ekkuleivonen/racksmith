import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";

type RepoComboboxProps = {
  items: string[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function RepoCombobox({
  items,
  value,
  onValueChange,
  disabled = false,
  placeholder = "Search repos...",
}: RepoComboboxProps) {
  const anchor = useComboboxAnchor();

  return (
    <div ref={anchor} className="w-full">
      <Combobox
        value={value ?? undefined}
        onValueChange={(v) => onValueChange(v ?? null)}
        items={items}
        disabled={disabled}
      >
      <ComboboxInput
        className="w-full"
        placeholder={placeholder}
        showClear={!!value}
      />
      <ComboboxContent anchor={anchor}>
        <ComboboxList>
          <ComboboxCollection>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxCollection>
          <ComboboxEmpty>No repos found</ComboboxEmpty>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
    </div>
  );
}
