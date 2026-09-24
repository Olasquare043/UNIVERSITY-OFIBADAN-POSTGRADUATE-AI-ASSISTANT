const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function startOfDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function formatRelative(timestamp, now = Date.now()) {
  const age = now - timestamp;
  if (age < MINUTE) return "just now";
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (startOfDay(timestamp) === startOfDay(now)) return `${Math.floor(age / HOUR)} h ago`;
  if (startOfDay(timestamp) === startOfDay(now - 24 * HOUR)) return "Yesterday";
  return new Date(timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function formatFull(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// Splits conversations (already newest first) into sidebar sections.
export function groupByDay(conversations, now = Date.now()) {
  const today = startOfDay(now);
  const yesterday = startOfDay(now - 24 * HOUR);
  const groups = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier", items: [] },
  ];

  for (const chat of conversations) {
    const day = startOfDay(chat.updatedAt);
    const index = day >= today ? 0 : day >= yesterday ? 1 : 2;
    groups[index].items.push(chat);
  }
  return groups.filter((group) => group.items.length > 0);
}

// Text for text-to-speech: drop markdown marks and inline citations.
export function toSpeakable(markdown) {
  return markdown
    .replace(/\(Source:[^)]*\)/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/[*_#`>]/g, "");
}
