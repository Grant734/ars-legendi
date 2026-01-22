import { Link } from "react-router-dom";
import { GRAMMAR_LESSONS_LIST } from "../data/grammarLessons";
import TextSelector from "../components/TextSelector";

export default function GrammarLessons() {
  return (
    <>
      <TextSelector className="-mx-6 -mt-6 mb-6" />
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-3">Grammar Lessons</h1>
          <p className="text-gray-600 max-w-2xl">
            Each lesson links directly to real examples from the text.
          </p>
        </div>

      {/* Lesson Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {GRAMMAR_LESSONS_LIST.map((l, index) => (
          <Link
            key={l.id}
            to={`/grammar/${l.id}`}
            className="group block bg-white border-2 border-gray-200 rounded-xl p-5 hover:border-accent hover:shadow-lg transition-all duration-200"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <h2 className="text-lg font-bold text-primary mb-2 group-hover:text-accent transition-colors">
              {l.title}
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              {l.summary}
            </p>
            <div className="mt-4 text-accent font-medium text-sm opacity-0 group-hover:opacity-100 transition-opacity">
              View lesson →
            </div>
          </Link>
        ))}
        </div>
      </div>
    </>
  );
}
