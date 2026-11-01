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

      <section className="about-privacy" aria-labelledby="privacy-heading">
        <h3 id="privacy-heading">Your privacy</h3>
        <ul>
          <li>You do not sign in, and we do not ask for your name, email or student number.</li>
          <li>Your chats are saved only on this device. You can delete them from the sidebar.</li>
          <li>
            We keep the text of each question, without your name or internet address, for a limited time so staff can see
            what is missing from the documents.
          </li>
          <li>Your question and the matching passages are sent to an outside AI service to write the answer.</li>
          <li>Please do not type personal details such as phone numbers, passwords or health information.</li>
        </ul>
      </section>

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
