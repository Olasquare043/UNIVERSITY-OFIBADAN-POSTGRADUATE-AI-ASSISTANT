import { useEffect, useState } from "react";
import { fetchDocuments } from "../api";

// Returns { status: "loading" | "ready" | "failed", documents }.
export function useDocuments() {
  const [state, setState] = useState({ status: "loading", documents: [] });

  useEffect(() => {
    const controller = new AbortController();

    fetchDocuments(controller.signal)
      .then((documents) => setState({ status: "ready", documents }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "failed", documents: [] });
      });

    return () => controller.abort();
  }, []);

  return state;
}
