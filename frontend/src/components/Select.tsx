// Single-choice picker used for every option list in the app. `searchable` lets the user type to filter,
// for long lists and for formats people know by name.

import { useMemo, useState, type ReactNode } from "react";
import { Combobox, Dropdown, Option } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";

export interface SelectOption<T extends string = string> {
  value: T;
  /** Shown in the closed field and matched by the search. */
  label: string;
  /** Richer content for the open list; defaults to the label. */
  content?: ReactNode;
  /** Extra words the search matches, e.g. an id or locale. */
  keywords?: string;
  disabled?: boolean;
}

interface SelectProps<T extends string> {
  options: SelectOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  searchable?: boolean;
  placeholder?: string;
  className?: string;
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  "aria-label"?: string;
}

const normalize = (s: string) => s.toLocaleLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

export function Select<T extends string>({
  options,
  value,
  onChange,
  searchable = false,
  placeholder,
  className,
  size,
  disabled,
  "aria-label": ariaLabel,
}: SelectProps<T>) {
  const { t } = useTranslation();
  // While the user types, the field shows the query instead of the selected label.
  const [query, setQuery] = useState<string | null>(null);
  const selected = options.find((o) => o.value === value);

  const visible = useMemo(() => {
    if (!searchable || !query) return options;
    const q = normalize(query.trim());
    return options.filter((o) => normalize(`${o.label} ${o.keywords ?? ""} ${o.value}`).includes(q));
  }, [options, query, searchable]);

  const items = visible.map((o) => (
    <Option key={o.value} value={o.value} text={o.label} disabled={o.disabled}>
      {o.content ?? o.label}
    </Option>
  ));

  if (!searchable) {
    return (
      <Dropdown
        className={className}
        size={size}
        disabled={disabled}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={selected?.label ?? ""}
        selectedOptions={value ? [value] : []}
        onOptionSelect={(_, d) => d.optionValue && onChange(d.optionValue as T)}
      >
        {items}
      </Dropdown>
    );
  }

  return (
    <Combobox
      className={className}
      size={size}
      disabled={disabled}
      aria-label={ariaLabel}
      // Focusing starts an empty search; the current choice stays visible as the placeholder.
      placeholder={selected?.label ?? placeholder ?? t("common.search")}
      value={query ?? selected?.label ?? ""}
      selectedOptions={value ? [value] : []}
      onFocus={() => setQuery("")}
      onChange={(e) => setQuery(e.target.value)}
      onOptionSelect={(_, d) => {
        // Fluent also fires this without a value when the typed text stops matching; that is not a choice.
        if (!d.optionValue) return;
        onChange(d.optionValue as T);
        setQuery(null);
      }}
      onBlur={() => setQuery(null)}
      onOpenChange={(_, d) => setQuery(d.open ? "" : null)}
    >
      {items.length > 0 ? (
        items
      ) : (
        <Option value="" text="" disabled>
          {t("common.noResults")}
        </Option>
      )}
    </Combobox>
  );
}
