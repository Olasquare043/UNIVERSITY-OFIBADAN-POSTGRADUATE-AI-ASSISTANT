import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

// Wraps the native <dialog>, which already handles focus trapping and Esc.
// variant "side" is a right-hand sheet (bottom sheet on phones); "center" is a modal.
export default function Dialog({ open, onClose, title, variant = "center", children }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog dialog-${variant}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>
        <div className="dialog-body">{open && children}</div>
      </div>
    </dialog>
  );
}
