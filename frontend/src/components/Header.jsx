import { useEffect, useRef, useState } from "react";
import { Download, Keyboard, MoreVertical, Moon, PanelLeft, Printer, Sun } from "lucide-react";

const STATUS_LABEL = { checking: "Checking", online: "Online", offline: "Offline" };

function MenuItem({ icon: Icon, label, disabled, onClick }) {
  return (
    <button className="menu-item" role="menuitem" disabled={disabled} onClick={onClick}>
      <Icon size={17} aria-hidden="true" />
      {label}
    </button>
  );
}

function ChatMenu({ hasChat, onExport, onPrint, onShortcuts }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function run(action) {
    setOpen(false);
    action();
  }

  return (
    <div className="menu-wrap" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="More options" aria-haspopup="menu" aria-expanded={open}>
        <MoreVertical size={20} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <MenuItem icon={Download} label="Export as Markdown" disabled={!hasChat} onClick={() => run(onExport)} />
          <MenuItem icon={Printer} label="Print or save as PDF" disabled={!hasChat} onClick={() => run(onPrint)} />
          <MenuItem icon={Keyboard} label="Keyboard shortcuts" onClick={() => run(onShortcuts)} />
        </div>
      )}
    </div>
  );
}

export default function Header({ title, health, theme, sidebarOpen, hasChat, onToggleSidebar, onToggleTheme, onExport, onPrint, onShortcuts }) {
  return (
    <header className="header">
      <button
        className="icon-btn"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        aria-expanded={sidebarOpen}
        aria-controls="sidebar"
      >
        <PanelLeft size={20} />
      </button>

      <h2 className="header-title">{title}</h2>

      <span className="health" data-status={health} role="status" title={`Assistant is ${STATUS_LABEL[health].toLowerCase()}`}>
        <span className="health-dot" aria-hidden="true" />
        {STATUS_LABEL[health]}
      </span>

      <button
        className="icon-btn"
        onClick={onToggleTheme}
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      >
        {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <ChatMenu hasChat={hasChat} onExport={onExport} onPrint={onPrint} onShortcuts={onShortcuts} />
    </header>
  );
}
