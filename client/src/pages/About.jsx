import { Link } from "react-router-dom";

export default function About() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-primary mb-6">About Ars Legendi</h1>

      <p className="text-gray-700 leading-relaxed mb-4">
        Ars Legendi ("the art of reading") is a text-anchored Latin learning
        platform. Its premise is that vocabulary, grammar, and reading
        practice should all draw from real classical texts rather than
        isolated drills. Every word you practice, every construction you
        study, and every sentence you read comes from an actual work:
        currently Caesar's <em>De Bello Gallico</em> (Book 1) and selected
        letters of Pliny the Younger.
      </p>
      <p className="text-gray-700 leading-relaxed mb-4">
        The platform was built by a student as an independent project. It is
        free, non-commercial, and ad-free.
      </p>

      <h2 className="text-xl font-bold text-primary mt-10 mb-3">Disclaimer</h2>
      <p className="text-gray-700 leading-relaxed mb-4">
        This tool is provided as-is for educational purposes. The Latin texts
        are drawn from public-domain sources. The English translations of
        Caesar are public-domain (from the 1917 Loeb translation, via
        LacusCurtius); the translations of Pliny are the author's own work.
        All translations are study aids, not authoritative scholarly
        editions, and may contain errors. Automated grammatical tagging is
        heuristic and imperfect.
      </p>
      <p className="text-gray-700 leading-relaxed mb-4">
        Reviewers and educators named on this site provided feedback or
        piloted the tool; their feedback does not constitute endorsement
        unless explicitly stated, and the project is not affiliated with or
        sponsored by any institution.
      </p>

      <h2 className="text-xl font-bold text-primary mt-10 mb-3">Contact</h2>
      <p className="text-gray-700 leading-relaxed mb-4">
        <a
          href="mailto:granthenry34@icloud.com"
          className="text-accent hover:underline font-medium"
        >
          granthenry34@icloud.com
        </a>
      </p>

      <div className="mt-10">
        <Link to="/" className="text-accent hover:underline font-medium">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
