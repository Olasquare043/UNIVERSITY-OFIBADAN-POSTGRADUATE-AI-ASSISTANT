import { useEffect, useState } from "react";
import { Megaphone, WifiOff } from "lucide-react";

const WAKE_GRACE_MS = 4000;

// Messages above the chat: the admin's announcement, and a notice when the connection or server is not ready.
export default function Banners({ health, announcement }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [graceOver, setGraceOver] = useState(false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const timer = setTimeout(() => setGraceOver(true), WAKE_GRACE_MS);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearTimeout(timer);
    };
  }, []);

  let status = null;
  if (!online) {
    status = "You are offline. Your saved chats are still here, and you can ask again when you reconnect.";
  } else if (health !== "online" && graceOver) {
    status = "The assistant is waking up. This can take up to a minute after it has been idle.";
  }

  return (
    <>
      {status && (
        <div className="banner banner-status" role="status">
          <WifiOff size={16} aria-hidden="true" />
          {status}
        </div>
      )}
      {announcement && (
        <div className="banner banner-announcement" role="note">
          <Megaphone size={16} aria-hidden="true" />
          {announcement}
        </div>
      )}
    </>
  );
}
