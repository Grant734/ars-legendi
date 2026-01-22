import { motion } from 'framer-motion';

export default function About() {
  return (
    <div className="bg-[#fdfaf2] text-primary py-12 min-h-screen">
      {/* Page Container */}
      <div className="max-w-7xl mx-auto px-6 flex flex-col items-center">
        
        {/* Mission Section */}
        <motion.section
          className="w-full max-w-3xl bg-white rounded-3xl shadow-xl border border-yellow-400 p-8 text-center mb-20"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <h2 className="text-4xl font-extrabold text-blue-800 mb-6">Our Mission</h2>
          <p className="text-lg text-gray-800 leading-relaxed mb-3">
            At <span className="text-yellow-800 font-semibold">LatinEd</span>, we believe Latin is more than a language — it's a gateway to critical thinking, historical awareness, and intellectual curiosity.
          </p>
          <p className="text-lg text-gray-800 leading-relaxed">
            Through interactive tools, thoughtful curriculum, and community-driven content, we aim to inspire the next generation of classical thinkers.
          </p>
        </motion.section>

        {/* Team Section */}
        <motion.section
          className="w-full max-w-4xl text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          viewport={{ once: true }}
        >
          <h3 className="text-3xl font-extrabold text-blue-800 mb-12">Meet the Team</h3>

          <div className="flex flex-col items-center gap-10">
            <motion.div
              className="bg-white border border-gray-200 rounded-2xl p-6 shadow-md hover:shadow-lg transition transform hover:scale-105 w-full max-w-md"
              whileHover={{ y: -4 }}
            >
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Head_of_Oceanus%2C_BM_1805.jpg/800px-Head_of_Oceanus%2C_BM_1805.jpg"
                alt="Grant Henry"
                className="w-28 h-28 rounded-full mx-auto mb-4 object-cover border-4 border-yellow-500"
              />
              <h4 className="text-xl font-bold text-blue-900">Grant Henry</h4>
              <p className="text-sm text-gray-600">Founder & Curriculum Lead</p>
              <p className="text-sm italic mt-2">"Making Latin not just alive, but exciting."</p>
            </motion.div>

            {/* Add more team members here */}
          </div>
        </motion.section>
      </div>
    </div>
  );
}
