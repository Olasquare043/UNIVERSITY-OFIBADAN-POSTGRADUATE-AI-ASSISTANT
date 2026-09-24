import Dialog from "./Dialog";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "Cmd" : "Ctrl";

const SHORTCUTS = [
  { keys: [MOD, "K"], action: "Start a new chat" },
  { keys: ["/"], action: "Focus the message box" },
  { keys: ["Esc"], action: "Stop the answer being written" },
  { keys: ["Enter"], action: "Send your message" },
  { keys: ["Shift", "Enter"], action: "Add a new line" },
];

export default function ShortcutsDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <ul className="shortcut-list">
        {SHORTCUTS.map((item) => (
          <li key={item.action}>
            <span>{item.action}</span>
            <span className="keys">
              {item.keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
