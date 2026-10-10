import Crest from "./Crest";
import { TOPIC_ICONS } from "../topics";

export default function Welcome({ config, onPick, disabled }) {
  return (
    <div className="welcome">
      <section className="hero">
        <Crest height={96} alt="University of Ibadan crest" />
        <div>
          <p className="motto">Recte Sapere Fons</p>
          <p className="motto-meaning">For knowledge and sound judgment</p>
          <h1>How can I help you today?</h1>
          <p className="welcome-lead">{config.tagline}</p>
        </div>
      </section>

      <ul className="topics" aria-label="Topics">
        {config.suggested_topics.map((topic) => {
          const Icon = TOPIC_ICONS[topic.icon] || TOPIC_ICONS["file-text"];
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
