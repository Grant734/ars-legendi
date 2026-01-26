// src/pages/NewPost.jsx
import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from "../lib/api";

export default function NewPost() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !content) return;

    try {
      await axios.post(apiUrl("/api/posts"), {
        title,
        content,
        coverImage,
      });
      navigate("/blog");
    } catch (err) {
      console.error("Failed to create post", err);
    }
  };

  return (
    <div className="container max-w-2xl mx-auto py-10">
      <h2 className="text-2xl font-bold mb-4">Create New Post</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full border border-gray-300 px-4 py-2 rounded"
          required
        />
        <input
          type="text"
          placeholder="Cover Image URL"
          value={coverImage}
          onChange={e => setCoverImage(e.target.value)}
          className="w-full border border-gray-300 px-4 py-2 rounded"
        />
        <textarea
          placeholder="Markdown content"
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={10}
          className="w-full border border-gray-300 px-4 py-2 rounded"
          required
        />
        <button
          type="submit"
          className="bg-accent hover:bg-yellow-500 text-white px-6 py-2 rounded"
        >
          Publish
        </button>
      </form>
    </div>
  );
}
