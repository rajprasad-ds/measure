import { useId, useRef, useState } from "react";

export type SearchOption = {
  id: string;
  label: string;
  detail?: string;
};

type SearchSelectProps = {
  label: string;
  value: string;
  options: SearchOption[];
  placeholder: string;
  emptyMessage: string;
  onChange: (id: string) => void;
};

const RESULT_LIMIT = 2;

function SearchSelect({
  label,
  value,
  options,
  placeholder,
  emptyMessage,
  onChange,
}: SearchSelectProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedOption = options.find((option) => option.id === value);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingOptions = normalizedQuery
    ? options.filter((option) =>
        option.label.toLocaleLowerCase().includes(normalizedQuery),
      )
    : [];
  const visibleOptions = matchingOptions.slice(0, RESULT_LIMIT);
  const listId = `${id}-options`;

  function choose(option: SearchOption) {
    onChange(option.id);
    setQuery("");
    setIsOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      setQuery("");
      return;
    }

    if (event.key === "ArrowDown" && visibleOptions.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index + 1) % visibleOptions.length);
      return;
    }

    if (event.key === "ArrowUp" && visibleOptions.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex(
        (index) => (index - 1 + visibleOptions.length) % visibleOptions.length,
      );
      return;
    }

    if (event.key === "Enter" && isOpen && visibleOptions[activeIndex]) {
      event.preventDefault();
      choose(visibleOptions[activeIndex]);
    }
  }

  return (
    <div className="search-select">
      <label className="search-select-label" htmlFor={id}>
        {label}
      </label>
      <div className="search-select-control">
        <input
          ref={inputRef}
          id={id}
          type="search"
          role="combobox"
          autoComplete="off"
          value={isOpen ? query : selectedOption?.label ?? ""}
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-expanded={isOpen && normalizedQuery.length > 0}
          aria-controls={listId}
          aria-activedescendant={
            isOpen && visibleOptions[activeIndex]
              ? `${listId}-${visibleOptions[activeIndex].id}`
              : undefined
          }
          onFocus={() => setIsOpen(true)}
          onClick={() => {
            if (!isOpen) {
              setQuery("");
              setIsOpen(true);
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setIsOpen(false);
            setQuery("");
          }}
        />
        <span className="search-select-icon" aria-hidden="true">
          ⌕
        </span>
        {isOpen && normalizedQuery.length > 0 && (
          <div className="search-select-menu" id={listId} role="listbox">
            {visibleOptions.length > 0 ? (
              <>
                {visibleOptions.map((option, index) => (
                  <button
                    className={
                      index === activeIndex
                        ? "search-select-option active"
                        : "search-select-option"
                    }
                    id={`${listId}-${option.id}`}
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={value === option.id}
                    onPointerDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option)}
                  >
                    <span>{option.label}</span>
                    {option.detail && <small>{option.detail}</small>}
                  </button>
                ))}
                {matchingOptions.length > RESULT_LIMIT && (
                  <p className="search-select-hint">
                    Showing {RESULT_LIMIT} of {matchingOptions.length} matches.
                    Refine your search.
                  </p>
                )}
              </>
            ) : (
              <p className="search-select-empty">{emptyMessage}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchSelect;
