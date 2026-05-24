import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-stone-300 bg-stone-100/70 text-stone-600 mt-12">
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
        <div className="text-center sm:text-left">
          <span className="font-semibold tracking-wide text-primary">Ars Legendi</span>
          <span className="mx-2 text-stone-400">·</span>
          <span>© 2026 Ars Legendi. A non-commercial educational project.</span>
        </div>
        <nav className="flex items-center gap-5">
          <Link
            to="/about"
            className="text-amber-700 hover:text-amber-900 transition-colors"
          >
            About
          </Link>
          <Link
            to="/privacy"
            className="text-amber-700 hover:text-amber-900 transition-colors"
          >
            Privacy
          </Link>
          <Link
            to="/about"
            className="text-amber-700 hover:text-amber-900 transition-colors"
          >
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
