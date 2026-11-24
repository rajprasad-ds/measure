type Tab = "practice" | "cards" | "history" | "sync";

type Props = {
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "practice", label: "Practice" },
  { id: "cards", label: "Cards" },
  { id: "history", label: "History" },
  { id: "sync", label: "Sync" },
];

export default function MainNavigation({ activeTab, onNavigate }: Props) {
  return (
    <nav className="bottom-navigation" aria-label="Main navigation">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-current={activeTab === id ? "page" : undefined}
          onClick={() => onNavigate(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
