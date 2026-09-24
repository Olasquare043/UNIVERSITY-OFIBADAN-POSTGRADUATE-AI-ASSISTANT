import { useEffect, useState } from "react";
import { fetchDocuments } from "../api";

// Returns { status: "loading" | "ready" | "failed", documents, totalChunks }.
export function useDocuments() {
  const [state, setState] = useState({ status: "loading", documents: [], totalChunks: 0 });

  useEffect(() => {
    const controller = new AbortController();

    fetchDocuments(controller.signal)
      .then((data) => setState({ status: "ready", ...data }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "failed", documents: [], totalChunks: 0 });
      });

    return () => controller.abort();
  }, []);

  return state;
}
