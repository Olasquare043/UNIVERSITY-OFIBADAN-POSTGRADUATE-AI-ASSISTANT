import Crest from "./Crest";
import { TOPICS } from "../topics";

function Stat({ value, label }) {
  return (
    <div className="stat">
      <span className="stat-value">{value.toLocaleString()}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export default function Welcome({ docs, onPick, disabled }) {
  return (
    <div className="welcome">
      <section className="hero">
        <Crest height={96} alt="University of Ibadan crest" />
        <div>
          <p className="motto">Recte Sapere Fons</p>
          <p className="motto-meaning">For knowledge and sound judgment</p>
          <h1>Hello, scholar 👋</h1>
          <p className="welcome-lead">
            Ask about admission, registration, fees, thesis submission or examinations. Every answer comes from official
            University of Ibadan documents, with the source shown beside it.
          </p>
          {docs.status === "ready" && docs.documents.length > 0 && (
            <div className="stats">
              <Stat value={docs.documents.length} label="documents" />
              <Stat value={docs.totalChunks} label="indexed passages" />
            </div>
          )}
        </div>
      </section>

      <ul className="topics" aria-label="Topics">
        {TOPICS.map((topic) => {
          const Icon = topic.icon;
          return (
            <li key={topic.title} className="topic">
              <h2>
                <span className="topic-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                {topic.title}
              </h2>
              <ul>
                {topic.questions.map((question) => (
                  <li key={question}>
                    <button className="topic-question" disabled={disabled} onClick={() => onPick(question)}>
                      {question}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
