// Set to false the first time the backend answers 404/405 for the stream endpoint.
let streamAvailable = true;

const STALL_TIMEOUT_MS = 30000;

export async function sendChat(message, history, signal) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
    signal,
  });
  if (!response.ok) throw new Error(`Chat request failed with status ${response.status}`);

  const data = await response.json();
  return {
    answer: String(data.answer ?? ""),
    sources: Array.isArray(data.sources) ? data.sources : [],
  };
}

function parseEvent(block) {
  let name = "message";
  const dataLines = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    return { name, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

async function readEvents(body, onEvent, onActivity) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onActivity();

    buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
    let end;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const event = parseEvent(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      if (event) onEvent(event.name, event.data);
    }
  }
}

// Reports progress through onEvent(name, data) using the stream event names
// (status, retrieved, token, done). Falls back to the plain endpoint when the
// backend has no stream route, so callers only deal with one shape.
export async function askAssistant(message, history, signal, onEvent) {
  if (streamAvailable) {
    // A silent, half-open connection never errors on its own, so give up when nothing arrives for a while.
    const connection = new AbortController();
    signal.addEventListener("abort", () => connection.abort(), { once: true });
    let stalled = false;
    let watchdog;
    const armWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        stalled = true;
        connection.abort();
      }, STALL_TIMEOUT_MS);
    };

    try {
      armWatchdog();
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ message, history }),
        signal: connection.signal,
      });

      if (response.status === 404 || response.status === 405) {
        streamAvailable = false;
      } else {
        if (!response.ok || !response.body) throw new Error(`Stream request failed with status ${response.status}`);

        let finished = false;
        await readEvents(
          response.body,
          (name, data) => {
            if (name === "error") throw new Error(data.message || "The stream reported an error");
            if (name === "done") finished = true;
            onEvent(name, data);
          },
          armWatchdog,
        );
        if (!finished) throw new Error("The stream ended before the answer was complete");
        return;
      }
    } catch (error) {
      if (stalled) throw new Error("The stream stopped responding");
      throw error;
    } finally {
      clearTimeout(watchdog);
    }
  }

  onEvent("status", { stage: "searching" });
  const { answer, sources } = await sendChat(message, history, signal);
  onEvent("done", { answer, sources });
}

export async function checkHealth(signal) {
  try {
    const response = await fetch("/api/health", { signal });
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function fetchDocuments(signal) {
  const response = await fetch("/api/documents", { signal });
  if (!response.ok) throw new Error(`Documents request failed with status ${response.status}`);

  const data = await response.json();
  return {
    documents: Array.isArray(data.documents) ? data.documents : [],
    totalChunks: Number(data.total_chunks) || 0,
  };
}
