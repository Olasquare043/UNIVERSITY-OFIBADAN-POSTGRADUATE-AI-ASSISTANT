import { formatFull } from "./format";

function toMarkdown(conversation) {
  const lines = [`# ${conversation.title}`, "", `Exported ${formatFull(Date.now())} from the University of Ibadan Postgraduate Assistant.`, ""];

  for (const message of conversation.messages) {
    if (message.role === "user") {
      lines.push(`## You`, "", message.content, "");
      continue;
    }
    lines.push(`## Assistant`, "", message.content || "_No answer received._", "");
    if (message.sources?.length) {
      lines.push("**Sources**", "");
      for (const source of message.sources) {
        lines.push(`- ${source.document}${source.page != null ? `, p.${source.page}` : ""}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function exportMarkdown(conversation) {
  const blob = new Blob([toMarkdown(conversation)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const name = conversation.title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "conversation";

  link.href = url;
  link.download = `${name}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
