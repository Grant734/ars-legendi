import { Link } from "react-router-dom";
import { motion } from "framer-motion";

export default function BlogPostCard({ post }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ scale: 1.02 }}
      className="bg-white rounded-xl shadow-md overflow-hidden transition-all"
    >
      {post.coverImage && (
        <img
          src={post.coverImage}
          alt={post.title}
          className="w-full h-56 object-cover"
        />
      )}

      <div className="p-6">
        <h2 className="text-2xl font-bold text-blue-800 mb-2">{post.title}</h2>
        <p className="text-sm text-gray-600 mb-4">{post.date}</p>
        <p className="text-gray-700 line-clamp-3 mb-4">
          {post.content.slice(0, 200)}...
        </p>
        <Link
          to={`/blog/${post.slug}`}
          className="text-blue-700 font-semibold hover:text-yellow-500 transition"
        >
          Read More →
        </Link>
      </div>
    </motion.div>
  );
}
