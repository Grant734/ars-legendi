import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-primary mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: May 17, 2026</p>

      <p className="text-gray-700 leading-relaxed mb-8">
        Ars Legendi is a free, non-commercial educational tool for learning
        Latin, built and maintained by a student. This policy explains what
        information the site handles and how.
      </p>

      <h2 className="text-xl font-bold text-primary mt-10 mb-3">What we store</h2>
      <p className="text-gray-700 leading-relaxed mb-4">
        If you use the site without an account ("solo" practice), your progress
        is stored only in your own browser. A random session identifier is
        generated locally. This data is not linked to your name, email, or any
        personal identity, and most of it never leaves your device.
      </p>
      <p className="text-gray-700 leading-relaxed mb-3">
        If you create an account or join a teacher-assigned class, we store:
      </p>
      <ul className="list-disc pl-6 text-gray-700 leading-relaxed space-y-2 mb-4">
        <li>Your email address and a display name you choose.</li>
        <li>
          Your password, stored only as a bcrypt hash. We never store or can
          see your actual password.
        </li>
        <li>
          Your practice activity (which words and constructions you practiced,
          whether answers were correct, timestamps), which becomes linked to
          your account.
        </li>
        <li>
          For class assignments, a record connecting your work to the
          assignment and class.
        </li>
      </ul>
      <p className="text-gray-700 leading-relaxed mb-4">
        If you use the contact form, we store the name, email, and message you
        submit so we can respond.
      </p>

      <h2 className="text-xl font-bold text-primary mt-10 mb-3">What we don't do</h2>
      <ul className="list-disc pl-6 text-gray-700 leading-relaxed space-y-2 mb-4">
        <li>We do not sell or share your data with anyone.</li>
        <li>We do not show ads.</li>
        <li>We do not use analytics, tracking pixels, or third-party trackers.</li>
        <li>We do not use cookies.</li>
      </ul>
      <p className="text-gray-700 leading-relaxed mb-4">
        The site loads fonts and styling from public content delivery networks
        (Google Fonts and a CSS CDN). As a normal part of loading these files,
        those services may see your IP address and browser type. No information
        about your activity on the site is sent to them.
      </p>

      <h2 className="text-xl font-bold text-primary mt-10 mb-3">Students and minors</h2>
      <p className="text-gray-700 leading-relaxed mb-4">
        This tool is designed for use in an educational setting, often under
        the supervision of a teacher. Where students under 13 use the site, we
        rely on the involvement and consent of their school or teacher,
        consistent with how schools authorize educational tools. We do not
        knowingly collect personal information from children under 13 outside
        of a school-authorized educational context.
      </p>

      <h2 className="text-xl font-bold text-primary mt-10 mb-3">Data retention and deletion</h2>
      <p className="text-gray-700 leading-relaxed mb-4">
        You can request that we delete your account and associated data, or
        any contact-form message you sent, by emailing{" "}
        <a
          href="mailto:granthenry34@icloud.com"
          className="text-accent hover:underline font-medium"
        >
          granthenry34@icloud.com
        </a>
        . We will remove it.
      </p>

      <h2 className="text-xl font-bold text-primary mt-10 mb-3">Security</h2>
      <p className="text-gray-700 leading-relaxed mb-4">
        Passwords are hashed with bcrypt. We take reasonable measures to
        protect stored data, but no system is perfectly secure. This is a
        student-built educational project, not a commercial service, and it
        should not be used to store sensitive personal information.
      </p>

      <h2 className="text-xl font-bold text-primary mt-10 mb-3">Changes</h2>
      <p className="text-gray-700 leading-relaxed mb-4">
        If this policy changes, the "last updated" date above will change with it.
      </p>

      <h2 className="text-xl font-bold text-primary mt-10 mb-3">Contact</h2>
      <p className="text-gray-700 leading-relaxed mb-4">
        Questions about privacy, or requests to delete data:{" "}
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
