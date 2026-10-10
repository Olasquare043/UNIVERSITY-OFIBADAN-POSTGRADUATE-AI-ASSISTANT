import { useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Welcome from "./components/Welcome";
import MessageList from "./components/MessageList";
import Composer from "./components/Composer";
import AboutDialog from "./components/AboutDialog";
import KnowledgeBaseDialog from "./components/KnowledgeBaseDialog";
import ShortcutsDialog from "./components/ShortcutsDialog";
import SourceDialog from "./components/SourceDialog";
import Banners from "./components/Banners";
import { useConfig } from "./hooks/useConfig";
import { useConversations } from "./hooks/useConversations";
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import { useDocuments } from "./hooks/useDocuments";
import { useHealth } from "./hooks/useHealth";
import { useTheme } from "./hooks/useTheme";
import { exportMarkdown } from "./exportChat";

const DESKTOP_QUERY = "(min-width: 860px)";

function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

const MODEL_KEY = "ui-pg-model";

function readModel() {
  try {
    return localStorage.getItem(MODEL_KEY) || "";
  } catch {
    return "";
  }
}

export default function App() {
  const config = useConfig();
  const [chosenModel, setChosenModel] = useState(readModel);
  // Only a model the admin currently offers counts; otherwise the server's default is used.
  const model = config.model_choice && config.models.some((m) => m.id === chosenModel) ? chosenModel : config.default_model;
  const chats = useConversations(config.model_choice ? model : undefined);
  const install = useInstallPrompt();
  const docs = useDocuments();
  const health = useHealth();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    document.title = config.app_name;
  }, [config.app_name]);

  function changeModel(id) {
    setChosenModel(id);
    try {
      localStorage.setItem(MODEL_KEY, id);
    } catch {
      // The choice then lasts until the page is closed.
    }
  }
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  const [dialog, setDialog] = useState(null); // "about" | "knowledge" | "shortcuts" | null
  const [openSource, setOpenSource] = useState(null);
  const inputRef = useRef(null);

  function newChat() {
    chats.startNew();
    closeDrawerOnMobile();
    inputRef.current?.focus();
  }

  useEffect(() => {
    function onKeyDown(event) {
      const dialogOpen = document.querySelector("dialog[open]");

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        newChat();
      } else if (event.key === "/" && !isTyping(event.target) && !dialogOpen) {
        event.preventDefault();
        inputRef.current?.focus();
      } else if (event.key === "Escape" && chats.busy && !dialogOpen) {
        chats.stop();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  // On phones the sidebar is a drawer, so close it after the user makes a choice.
  function closeDrawerOnMobile() {
    if (!window.matchMedia(DESKTOP_QUERY).matches) setSidebarOpen(false);
  }

  function handleSelect(id) {
    chats.select(id);
    closeDrawerOnMobile();
  }

  function openDialog(name) {
    setDialog(name);
    closeDrawerOnMobile();
  }

  return (
    <div className="app" data-sidebar={sidebarOpen ? "open" : "closed"}>
      <Sidebar
        open={sidebarOpen}
        conversations={chats.conversations}
        activeId={chats.activeId}
        onNew={newChat}
        onSelect={handleSelect}
        onRename={chats.rename}
        onDelete={chats.remove}
        onClearAll={chats.clearAll}
        onClose={() => setSidebarOpen(false)}
        onOpenKnowledge={() => openDialog("knowledge")}
        onOpenAbout={() => openDialog("about")}
        config={config}
        install={install}
      />

      <main className="main">
        <Header
          title={chats.active ? chats.active.title : "New chat"}
          theme={theme}
          sidebarOpen={sidebarOpen}
          hasChat={chats.active !== null}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onToggleTheme={toggleTheme}
          onExport={() => exportMarkdown(chats.active)}
          onPrint={() => window.print()}
          onShortcuts={() => setDialog("shortcuts")}
        />

        <Banners health={health} announcement={config.announcement} />

        {chats.active ? (
          <MessageList
            key={chats.active.id}
            title={chats.active.title}
            messages={chats.active.messages}
            live={chats.live}
            busy={chats.busy}
            onSend={chats.send}
            onRegenerate={chats.regenerate}
            onFeedback={chats.setFeedback}
            onEdit={chats.editAndResend}
            onOpenSource={setOpenSource}
          />
        ) : (
          <div className="thread">
            <Welcome config={config} onPick={chats.send} disabled={chats.busy} />
          </div>
        )}

        <Composer config={config} model={model} onModelChange={changeModel} pending={chats.busy} focusKey={chats.activeId} inputRef={inputRef} onSend={chats.send} onStop={chats.stop} />
      </main>

      <AboutDialog open={dialog === "about"} onClose={() => setDialog(null)} config={config} />
      <KnowledgeBaseDialog open={dialog === "knowledge"} onClose={() => setDialog(null)} docs={docs} />
      <ShortcutsDialog open={dialog === "shortcuts"} onClose={() => setDialog(null)} />
      <SourceDialog source={openSource} documents={docs.documents} onClose={() => setOpenSource(null)} />
    </div>
  );
}
