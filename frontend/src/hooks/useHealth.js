import { useEffect, useState } from "react";
import { checkHealth } from "../api";

const POLL_MS = 30000;

// Returns "checking" | "online" | "offline".
export function useHealth() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    const controller = new AbortController();

    async function poll() {
      const ok = await checkHealth(controller.signal);
      if (!controller.signal.aborted) setStatus(ok ? "online" : "offline");
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  return status;
}
