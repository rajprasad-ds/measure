import { useMemo, useState } from "react";

export type CardPickerOption = {
  id: string;
  label: string;
  detail?: string;
};

type Props = {
  label: string;
  options: CardPickerOption[];
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  onSelect?: (option: CardPickerOption) => void;
};

export default function CardPicker({
  label,
  options,
  name,
  defaultValue = "",
  placeholder = "Search saved cards",
  onSelect,
}: Props) {
  const [selectedId, setSelectedId] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.id === selectedId);
  const matches = useMemo(() => {
    const search = query.trim().toLowerCase();
    return options
      .filter(
        (option) =>
          !search ||
          `${option.label} ${option.detail ?? ""}`.toLowerCase().includes(search),
      )
      .slice(0, 20);
  }, [options, query]);

  function choose(option: CardPickerOption) {
    setSelectedId(option.id);
    setQuery("");
    setIsOpen(false);
    onSelect?.(option);
  }

  return (
    <div className="card-picker">
      <span className="card-picker-label">{label}</span>
      {name && <input type="hidden" name={name} value={selectedId} />}
      {selected ? (
        <div className="card-picker-selected">
          <span>{selected.label}</span>
          <button type="button" onClick={() => setSelectedId("")}>
            Change
          </button>
        </div>
      ) : (
        <input
          type="search"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setIsOpen(false);
          }}
        />
      )}
      {isOpen && !selected && (
        <ul className="card-picker-results" role="listbox">
          {matches.length === 0 ? (
            <li className="card-picker-empty">No saved cards match.</li>
          ) : (
            matches.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  onClick={() => choose(option)}
                >
                  <span>{option.label}</span>
                  {option.detail && <small>{option.detail}</small>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
