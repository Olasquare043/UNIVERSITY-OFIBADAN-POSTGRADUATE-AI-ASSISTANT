import { useState } from "react";
import { Download } from "lucide-react";
import { Card, PageHead, useAdminData } from "../ui";

function Tile({ label, value, note }) {
  return (
    <div className="admin-tile">
      <span className="admin-tile-value">{value}</span>
      <span className="admin-tile-label">{label}</span>
      {note && <span className="admin-hint">{note}</span>}
    </div>
  );
}

// Questions per day as a small bar chart: one bar per day, tallest bar = busiest day.
function DayChart({ points }) {
  const max = Math.max(1, ...points.map((p) => p.questions));
  const total = points.reduce((sum, p) => sum + p.questions, 0);

  return (
    <figure className="admin-chart" aria-label={`Questions per day. ${total} in this period.`}>
      <div className="admin-bars">
        {points.map((p) => (
          <div key={p.date} className="admin-bar-slot" title={`${p.date}: ${p.questions} question${p.questions === 1 ? "" : "s"}`}>
            <span className="admin-bar" style={{ height: `${(p.questions / max) * 100}%` }} data-empty={p.questions === 0} />
          </div>
        ))}
      </div>
      <figcaption className="admin-axis-row">
        <span>{points[0]?.date.slice(5)}</span>
        <span>Busiest day: {max === 1 && total === 0 ? 0 : max}</span>
        <span>{points[points.length - 1]?.date.slice(5)}</span>
      </figcaption>
    </figure>
  );
}

function Ranking({ rows, empty }) {
  if (rows.length === 0) return <p className="admin-empty">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ul className="admin-rank">
      {rows.map((row) => (
        <li key={row.name}>
          <span className="admin-rank-name">{row.name}</span>
          <span className="admin-rank-bar" style={{ width: `${(row.count / max) * 100}%` }} />
          <span className="admin-rank-count">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Overview() {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useAdminData(`/analytics/overview?days=${days}`);

  return (
    <>
      <PageHead title="Overview">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <a className="admin-btn" href={`/api/admin/analytics/export.csv?days=${days}`}>
          <Download size={16} aria-hidden="true" />
          Export questions
        </a>
      </PageHead>

      {error && <p className="admin-error">{error}</p>}
      {loading && <p className="admin-empty">Loading…</p>}

      {data?.temporary_storage && (
        <div className="admin-warnbox" role="alert">
          <strong>Warning: temporary storage.</strong> This site is not connected to its permanent database, so uploaded
          documents, settings and statistics will be lost the next time it restarts. Set DATABASE_URL on the server (see
          the README, "Deploy").
        </div>
      )}

      {data && (
        <>
          <div className="admin-tiles">
            <Tile label="Questions" value={data.questions} />
            <Tile
              label="Answered from documents"
              value={data.answer_rate == null ? "–" : `${Math.round(data.answer_rate * 100)}%`}
              note="The rest found nothing relevant"
            />
            <Tile label="Average response time" value={data.avg_latency_ms == null ? "–" : `${(data.avg_latency_ms / 1000).toFixed(1)} s`} />
            <Tile label="Helpful / not helpful" value={`${data.thumbs_up} / ${data.thumbs_down}`} note="Student ratings" />
          </div>

          <Card title="Questions per day">
            <DayChart points={data.per_day} />
          </Card>

          <div className="admin-two">
            <Card title="Most cited documents">
              <Ranking rows={data.top_documents} empty="No answers have cited a document yet." />
            </Card>
            <Card title="Models used">
              <Ranking rows={data.models} empty="No answers yet." />
            </Card>
          </div>
        </>
      )}
    </>
  );
}
