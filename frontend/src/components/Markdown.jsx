import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Markdown does not treat "•" as a list marker, so convert it.
function normalizeBullets(text) {
  return text.replace(/^[ \t]*•[ \t]+/gm, "- ");
}

function Link({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

const PLUGINS = [remarkGfm];
const COMPONENTS = { a: Link };

export default function Markdown({ text, streaming = false }) {
  return (
    <div className="prose" data-streaming={streaming}>
      <ReactMarkdown remarkPlugins={PLUGINS} components={COMPONENTS}>
        {normalizeBullets(text)}
      </ReactMarkdown>
    </div>
  );
}
