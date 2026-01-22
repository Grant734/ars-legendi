import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="min-h-screen bg-backdrop">
      {/* Hero Section */}
      <section className="bg-primary text-white py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-4">
            <span className="text-accent">Ars Legendi</span>
          </h1>
          <p className="text-xl md:text-2xl text-white/80 mb-2 italic">
            A Classical Reading Framework
          </p>
          <p className="text-lg text-white/70 max-w-2xl mx-auto mt-6">
            Ars Legendi is a mastery-based reading and learning platform for Latin.
            The first module teaches students to read Caesar's <em>De Bello Gallico</em> Book 1.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              to="/grammar"
              className="px-8 py-3 bg-accent text-primary font-bold rounded-lg hover:bg-yellow-400 transition-all hover:scale-105"
            >
              Start Learning
            </Link>
            <Link
              to="/reading-guide"
              className="px-8 py-3 border-2 border-white/30 text-white font-bold rounded-lg hover:bg-white/10 transition-all"
            >
              Explore the Text
            </Link>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-primary text-center mb-8">
            At its core, Ars Legendi helps students do four things:
          </h2>

          <div className="grid md:grid-cols-2 gap-5">
            <FeatureCard
              title="Learn Grammar in Context"
              description="Learn grammatical concepts directly as they appear in the Latin, with clear lessons for each construction linked to examples in the text."
              link="/grammar"
              linkText="View Lessons"
            />
            <FeatureCard
              title="Master Vocabulary"
              description="Learn the vocabulary for each chapter through 54 quizzes designed to build lasting recognition and recall."
              link="/CaesarDBG1"
              linkText="Practice Vocab"
            />
            <FeatureCard
              title="Read with Support"
              description="Every single word is fully parsed and constructions are identified, giving you the support to read real Latin."
              link="/reading-guide"
              linkText="Read Caesar"
            />
            <FeatureCard
              title="Track Progress"
              description="Monitor your mastery over time with adaptive feedback based on areas of strength and weakness."
              link="/mastery"
              linkText="View Mastery"
            />
          </div>
        </div>
      </section>

      {/* The Goal */}
      <section className="py-12 px-6 bg-primary/5">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-primary mb-4">The Goal</h2>
          <p className="text-base text-gray-700 leading-relaxed">
            The long-term mission of Ars Legendi is to make it easier for other students and teachers
            to build similar reading environments for other Latin works. The project is designed as a
            repeatable method and shared standard for what reading support should look like.
          </p>
          <p className="text-base text-gray-700 leading-relaxed mt-3">
            Please view the{' '}
            <Link to="/methodology" className="text-accent hover:underline font-medium">
              Methodology page
            </Link>{' '}
            for a guide on how to implement this model and walk through the code.
          </p>
        </div>
      </section>

      {/* Background */}
      <section className="py-12 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-primary mb-4">Background</h2>
          <div className="space-y-3 text-base text-gray-700 leading-relaxed">
            <p>
              I started learning Latin the way most students do, by using vocabulary lists and grammar
              charts that were disconnected from reading real authors. Further along in my
              Latin education when I began reading Caesar, I realized that I could know the grammar and
              memorize the translation, but still not be able to read a page.
            </p>
            <p>
              Teachers are often able to recognize students' weaknesses and help accordingly. But even
              with access to a classroom and teacher, resources and feedback for practicing grammar
              and vocabulary are limited. This is why I created a tool that functions as a teacher
              (or teacher tool) inside and outside of the classroom.
            </p>
            <p>
              I began by designing a system around Caesar, because his prose is generally straightforward
              while also covering most fundamental grammatical constructions, and nearly all Latin students
              will read him at some point in their Classical career. I designed the learning and progression
              system so that it would recreate and reinforce teacher support in an efficient, and most
              importantly, text-anchored way, providing resources for both students and teachers.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-6 bg-primary text-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-accent mb-6">How It Works</h2>
          <div className="space-y-4 text-lg text-white/90 leading-relaxed">
            <p>
              Under the hood, the text is parsed using natural language processing (NLP). Each sentence
              is annotated with lemmas, morphological features, and syntactic structure using a UD-style
              pipeline. Grammatical detectors identify constructions, such as ablative absolutes and
              indirect statements, and mark their exact span in a given sentence.
            </p>
            <p>
              Stepping away from how traditional commentaries are painstakingly produced line-by-line,
              grammatical support is generated systematically in a way that is extendable to other
              authors and texts.
            </p>
            <p>
              The site tracks student mastery for both vocabulary and grammar, using performance history
              and an Elo system to distinguish new, developing, and mastered material. Adaptive
              feedback directs students to practice what they actually struggle with, rather than
              repeating what they already know. Teachers have access to a dashboard which presents
              class data and trends.
            </p>
          </div>
        </div>
      </section>

      {/* About the Creator */}
      <section className="py-12 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-primary mb-4">About the Creator</h2>
          <div className="space-y-3 text-base text-gray-700 leading-relaxed">
            <p>
              <span className="text-accent font-semibold">Salvē!</span> I'm Grant Henry, a high school
              student with a love for Classics who has a background in technology. I built Ars Legendi
              because I wanted a tool I would genuinely use, that stays grounded in real Latin, and
              guides students from "What is this???" to "I can translate" to "I can read."
            </p>
            <p>
              If you are interested in building a version for another author, have feedback, or want
              to pilot it with students, email{' '}
              <a
                href="mailto:granthenry34@icloud.com"
                className="text-accent hover:underline font-medium"
              >
                granthenry34@icloud.com
              </a>.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 px-6 bg-accent">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-primary mb-3">Ready to Start Reading?</h2>
          <p className="text-base text-primary/80 mb-6">
            Begin your journey with Caesar's <em>De Bello Gallico</em> today.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/grammar"
              className="px-8 py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-all"
            >
              Start with Lessons
            </Link>
            <Link
              to="/login"
              className="px-8 py-3 bg-white text-primary font-bold rounded-lg hover:bg-gray-100 transition-all"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description, link, linkText }) {
  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl p-5 hover:border-accent hover:shadow-lg transition-all group">
      {icon && <div className="text-4xl mb-3">{icon}</div>}
      <h3 className="text-lg font-bold text-primary mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-3">{description}</p>
      <Link
        to={link}
        className="text-accent font-semibold hover:underline inline-flex items-center gap-1 group-hover:gap-2 transition-all"
      >
        {linkText} <span>→</span>
      </Link>
    </div>
  );
}
