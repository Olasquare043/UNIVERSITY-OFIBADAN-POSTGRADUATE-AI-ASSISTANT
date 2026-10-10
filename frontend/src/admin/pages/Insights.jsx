import { api } from "../adminApi";
import { Card, formatDateTime, PageHead, useAdminData, useNotice } from "../ui";

export default function Insights() {
  const unanswered = useAdminData("/analytics/unanswered");
  const downvoted = useAdminData("/analytics/downvoted");
  const [notice, say] = useNotice();

  async function resolve(id) {
    try {
      await api(`/analytics/questions/${id}/resolve`, { method: "POST" });
      unanswered.reload();
    } catch (error) {
      say(error.message, "error");
    }
  }

  return (
    <>
      <PageHead title="Insights" />
      {notice}

      <Card
        title="Questions the documents could not answer"
        hint="These are gaps. Upload a document that covers them, then mark the question as dealt with."
      >
        {unanswered.data?.questions.length === 0 && <p className="ad-empty">No open gaps. Every recent question found relevant passages.</p>}
        <ul className="ad-list">
          {unanswered.data?.questions.map((q) => (
            <li key={q.id}>
              <div>
                <p className="ad-q">{q.question}</p>
                <p className="ad-hint">{formatDateTime(q.time)}</p>
              </div>
              <button className="ad-btn" onClick={() => resolve(q.id)}>
                Mark as dealt with
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Answers students rated as not helpful" hint="Check the cited documents and the wording of the answer for these.">
        {downvoted.data?.questions.length === 0 && <p className="ad-empty">No poor ratings yet.</p>}
        <ul className="ad-list">
          {downvoted.data?.questions.map((q) => (
            <li key={q.id}>
              <div>
                <p className="ad-q">{q.question}</p>
                {q.comment && <p className="ad-comment">“{q.comment}”</p>}
                <p className="ad-hint">
                  {formatDateTime(q.time)}
                  {q.model && ` · ${q.model}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
