import Dialog from "./Dialog";
import Crest from "./Crest";

export default function AboutDialog({ open, onClose, config }) {
  return (
    <Dialog open={open} onClose={onClose} title={`About ${config.app_name}`}>
      <div className="about-motto">
        <Crest height={84} alt="University of Ibadan crest" />
        <div>
          <p className="motto">Recte Sapere Fons</p>
          <p className="motto-meaning">For knowledge and sound judgment</p>
        </div>
      </div>

      <p>{config.tagline}</p>
      <p>{config.notice}</p>

      <dl className="about-contact">
        {config.contact_email && (
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${config.contact_email}`}>{config.contact_email}</a>
            </dd>
          </div>
        )}
        {config.contact_website && (
          <div>
            <dt>Website</dt>
            <dd>
              <a href={config.contact_website} target="_blank" rel="noopener noreferrer">
                {config.contact_website.replace(/^https?:\/\//, "")}
              </a>
            </dd>
          </div>
        )}
      </dl>
    </Dialog>
  );
}
