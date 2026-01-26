import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useEffect, useState } from 'react';
import axios from 'axios';
import useCreator from "../hooks/useCreator";
import { apiUrl } from "../lib/api";

export default function BlogPost() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isCreator } = useCreator();

  useEffect(() => {
    axios.get(apiUrl(`/api/posts/${slug}`))
      .then(res => {
        setPost(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading post:", err);
        navigate('/blog');
      });
  }, [slug, navigate]);

  const handleDelete = () => {
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    axios.delete(apiUrl(`/api/posts/${slug}`))
      .then(() => navigate('/blog'))
      .catch(err => alert("Failed to delete post"));
  };

  if (loading) return <p className="p-4">Loading...</p>;
  if (!post) return <h2 className="p-4 text-red-600">Post not found.</h2>;

  return (
    <div className="bg-backdrop min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto bg-white shadow-lg rounded-2xl p-8">
        <h1 className="text-4xl font-extrabold text-blue-800 mb-2">
          {post.title}
        </h1>
        <p className="text-sm text-gray-500 mb-6">{post.date}</p>

        {post.coverImage && (
          <img
            src={post.coverImage}
            alt="Cover"
            className="w-full max-h-[450px] object-cover rounded-xl mb-8"
          />
        )}

        <div className="prose prose-lg max-w-none text-primary prose-p:leading-relaxed prose-h1:text-3xl prose-h2:text-2xl prose-a:text-blue-600 prose-a:underline">
          <ReactMarkdown>{post.content}</ReactMarkdown>
        </div>

        {isCreator && (
          <div className="flex gap-4 mt-10">
            <button
              onClick={() => navigate(`/blog/edit/${post.slug}`)}
              className="bg-accent hover:bg-yellow-500 text-white px-4 py-2 rounded font-bold"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-bold"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
