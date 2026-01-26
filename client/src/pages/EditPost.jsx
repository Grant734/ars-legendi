import { useEffect, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import axios from "axios";
import useCreator from "../hooks/useCreator";
import { apiUrl } from "../lib/api";

export default function EditPost() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { isCreator } = useCreator();

  if (!isCreator) {
    return <Navigate to="/blog" replace />;
  }

  useEffect(() => {
    axios
      .get(apiUrl(`/api/posts/${slug}`))
      .then((res) => {
        const post = res.data;
        setTitle(post.title || "");
        setContent(post.content || "");
        setCoverImage(post.coverImage || "");
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading post:", err);
        setError("Post not found.");
        setLoading(false);
      });
  }, [slug]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.put(apiUrl(`/api/posts/${slug}`), {
        title,
        content,
        coverImage,
      });
      navigate(`/blog/${slug}`);
    } catch (err) {
      console.error("Update failed:", err);
      alert("Failed to update post");
    }
  };

  if (loading) return <p className="p-4">Loading...</p>;
  if (error) return <p className="p-4 text-red-600">{error}</p>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Edit Post</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Title"
          className="w-full p-2 border rounded"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Cover Image URL"
          className="w-full p-2 border rounded"
          value={coverImage}
          onChange={(e) => setCoverImage(e.target.value)}
        />
        <textarea
          placeholder="Content (Markdown supported)"
          className="w-full p-2 border rounded h-40"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Update
        </button>
      </form>
    </div>
  );
}
