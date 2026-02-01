import { Link } from "react-router-dom";
import TextSelector from "../components/TextSelector";

export default function Methodology() {
  return (
    <>
      <TextSelector className="-mx-6 -mt-6 mb-6" />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-primary mb-4">Methodology</h1>
        <p className="text-gray-600 mb-6">
          The pedagogical framework and technical implementation of Ars Legendi
          is detailed in our methodology document.
        </p>

        {/* PDF Preview and Download */}
        <a
          href="/ars_legendi_methodology_v2.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-accent hover:shadow-lg transition-all group"
        >
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* PDF Preview Image */}
            <div className="flex-shrink-0 border border-gray-200 rounded-lg overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
              <img
                src="/methodology_preview-01.png"
                alt="Ars Legendi Methodology - Page 1 Preview"
                className="w-48 h-auto"
              />
            </div>

            {/* PDF Info */}
            <div className="flex-1">
              <h2 className="text-xl font-bold text-primary mb-2 group-hover:text-accent transition-colors">
                Ars Legendi Methodology
              </h2>
              <p className="text-gray-600 mb-4">
                A comprehensive guide to our approach for teaching Latin through
                authentic texts, comprehensible input, and adaptive practice.
              </p>
              <div className="inline-flex items-center gap-2 text-accent font-medium">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                View PDF
              </div>
            </div>
          </div>
        </a>

        <div className="mt-6">
          <Link to="/" className="text-accent hover:underline font-medium">
            ← Back to Home
          </Link>
        </div>
      </div>
    </>
  );
}
