import { useState } from "react";
import ChildTab from "./components/ChildTab";
import ParentsTab from "./components/ParentsTab";
import PathTab from "./components/PathTab";
import PassivesTab from "./components/PassivesTab";
import OwnedTab from "./components/OwnedTab";
import "./App.css";

const TABS = [
  { id: "child", label: "Enfant", icon: "🥚" },
  { id: "parents", label: "Parents", icon: "🔍" },
  { id: "path", label: "Chemin", icon: "🗺️" },
  { id: "passives", label: "Passifs", icon: "✨" },
  { id: "owned", label: "Mes pals", icon: "📋" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const [tab, setTab] = useState<TabId>("child");

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          Palworld <span className="accent">Breeding</span>
        </h1>
        <p className="subtitle">Calculateur de reproduction</p>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={"tab" + (tab === t.id ? " active" : "")}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="tab-panel">
        {tab === "child" && <ChildTab />}
        {tab === "parents" && <ParentsTab />}
        {tab === "path" && <PathTab />}
        {tab === "passives" && <PassivesTab />}
        {tab === "owned" && <OwnedTab />}
      </main>

      <footer className="app-footer">
        Données extraites des fichiers du jeu (Palworld 1.0). Non affilié à
        Pocketpair.
      </footer>
    </div>
  );
}
