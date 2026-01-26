import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import useCreator from "../hooks/useCreator";
import { apiUrl } from "../lib/api";
import BlogPostCard from "../components/BlogPostCard";
import { motion } from "framer-motion";

export default function Blog() {
  const [posts, setPosts] = useState([]);
  const { isCreator } = useCreator();

  useEffect(() => {
    axios
      .get(apiUrl("/api/posts"))
      .then((res) => setPosts(res.data))
      .catch((err) => console.error("Error fetching posts", err));
  }, []);

  return (
    <div className="bg-backdrop text-primary min-h-screen px-6 py-12">
      <div className="max-w-5xl mx-auto">
        <motion.h1
          className="text-4xl font-extrabold text-blue-900 mb-8 text-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Blog
        </motion.h1>

        {isCreator && (
          <div className="text-center mb-10">
            <Link
              to="/blog/new"
              className="bg-accent text-white px-5 py-2 rounded-lg shadow hover:bg-yellow-600 transition"
            >
              Create New Post
            </Link>
          </div>
        )}

        <div className="space-y-10">
          {[...posts].reverse().map((post, idx) => (
            <motion.div
              key={post.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.05 }}
            >
              <BlogPostCard post={post} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
