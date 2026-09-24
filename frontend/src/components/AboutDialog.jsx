import Dialog from "./Dialog";
import Crest from "./Crest";

export default function AboutDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} title="About this assistant">
      <div className="about-motto">
        <Crest height={84} alt="University of Ibadan crest" />
        <div>
          <p className="motto">Recte Sapere Fons</p>
          <p className="motto-meaning">For knowledge and sound judgment</p>
        </div>
      </div>

      <p>
        This assistant answers questions about postgraduate study at the University of Ibadan. It is an{" "}
        <strong>unofficial student project</strong> built on publicly available documents from the Postgraduate College. It
        is not an official University service.
      </p>
      <p>
        Answers can be wrong or out of date. Check important details, such as fees, deadlines and submission rules, with the
        Postgraduate College before you act on them.
      </p>

      <dl className="about-contact">
        <div>
          <dt>Email</dt>
          <dd>
            <a href="mailto:informationdesk@pgcollege.ui.edu.ng">informationdesk@pgcollege.ui.edu.ng</a>
          </dd>
        </div>
        <div>
          <dt>Website</dt>
          <dd>
            <a href="https://pgcollege.ui.edu.ng" target="_blank" rel="noopener noreferrer">
              pgcollege.ui.edu.ng
            </a>
          </dd>
        </div>
      </dl>
    </Dialog>
  );
}
