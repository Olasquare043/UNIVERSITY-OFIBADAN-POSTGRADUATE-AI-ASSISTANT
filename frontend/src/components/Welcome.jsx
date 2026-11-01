import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import Crest from "./Crest";
import { TOPIC_ICONS } from "../topics";

// On phones only the chosen topic is shown, picked from a row of chips; wider screens show every topic as a card.
export default function Welcome({ config, onPick, disabled }) {
  const topics = config.suggested_topics;
  const [active, setActive] = useState(0);
  const iconFor = (topic) => TOPIC_ICONS[topic.icon] || TOPIC_ICONS["file-text"];

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

      {topics.length > 0 && (
        <div className="topic-chips" role="group" aria-label="Choose a topic">
          {topics.map((topic, index) => {
            const Icon = iconFor(topic);
            return (
              <button
                key={topic.title}
                className="topic-chip"
                aria-pressed={index === active}
                onClick={() => setActive(index)}
              >
                <Icon size={15} aria-hidden="true" />
                {topic.title}
              </button>
            );
          })}
        </div>
      )}

      <ul className="topics" aria-label="Suggested questions">
        {topics.map((topic, index) => {
          const Icon = iconFor(topic);
          return (
            <li key={topic.title} className="topic" data-active={index === active}>
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
                      <span>{question}</span>
                      <ArrowUpRight size={16} aria-hidden="true" />
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
