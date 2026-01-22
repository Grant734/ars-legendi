import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export default function BlogHome() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:3001/api/posts')
      .then(res => setPosts(res.data))
      .catch(err => console.error("Error fetching posts:", err));
  }, []);

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">Latest Posts</h2>
      <div className="space-y-6">
        {posts.map((post) => (
          <div key={post.slug} className="bg-white shadow-sm p-4 rounded-md border border-gray-200">
            <h3 className="text-xl font-semibold text-blue-700">{post.title}</h3>
            <p className="text-sm text-gray-500 mb-2">{post.date}</p>
            <p className="text-gray-700 mb-2">{post.content.slice(0, 100)}...</p>
            <Link to={`/blog/${post.slug}`} className="text-blue-500 hover:underline">Read More</Link>
          </div>
        ))}
      </div>
      <div className="mt-8 text-right">
        <Link to="/blog/new" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">+ New Post</Link>
      </div>
    </div>
  );
}
