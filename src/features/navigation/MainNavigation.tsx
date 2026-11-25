type Tab = "practice" | "cards" | "history" | "sync";

type Props = {
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "practice", label: "Home" },
  { id: "cards", label: "Cards" },
  { id: "history", label: "History" },
  { id: "sync", label: "Sync" },
];

function TabIcon({ tab }: { tab: Tab }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (tab === "practice") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>;
  if (tab === "cards") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="4" y="4" width="13" height="16" rx="2" /><path d="M8 8h5M8 12h5M18 7h2v13a1 1 0 0 1-1 1H8" /></svg>;
  if (tab === "history") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="7" cy="7" r="1" fill="currentColor" /><circle cx="17" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="17" r="1" fill="currentColor" /></svg>;
}

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
          <TabIcon tab={id} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
