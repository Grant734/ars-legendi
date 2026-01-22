// src/pages/Contact.jsx
import { useState, useEffect } from "react";
import axios from "axios";
import useCreator from "../hooks/useCreator";

export default function Contact() {
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [feedback, setFeedback] = useState(null);
  const [messages, setMessages] = useState([]);
  const { isCreator } = useCreator();

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);

    try {
      const res = await axios.post("http://localhost:3001/api/contact", formData);
      setFeedback({ success: true, text: res.data.message });
      setFormData({ name: "", email: "", message: "" });
    } catch (err) {
      setFeedback({ success: false, text: err.response?.data?.error || "Error submitting form." });
    }
  };

  useEffect(() => {
    if (isCreator) {
      axios.get("http://localhost:3001/api/contact/messages")
        .then(res => setMessages(res.data))
        .catch(err => console.error("Failed to fetch messages", err));
    }
  }, [isCreator]);

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <h1 className="text-3xl font-bold text-blue-800 mb-6">Contact Us</h1>

      <form onSubmit={handleSubmit} className="form-section max-w-xl space-y-4 mb-12">
        <div>
          <label className="form-label">Name</label>
          <input
            type="text"
            name="name"
            className="input-field"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label className="form-label">Email</label>
          <input
            type="email"
            name="email"
            className="input-field"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label className="form-label">Message</label>
          <textarea
            name="message"
            rows="6"
            className="input-field"
            value={formData.message}
            onChange={handleChange}
            required
          />
        </div>

        <button type="submit" className="btn-accent">Send Message</button>

        {feedback && (
          <p className={feedback.success ? "text-green-600" : "text-red-600"}>
            {feedback.text}
          </p>
        )}
      </form>

      {isCreator && (
        <div>
          <h2 className="text-2xl font-semibold text-blue-900 mb-4">Received Messages</h2>
          <div className="space-y-4">
            {messages.length === 0 ? (
              <p className="text-gray-600">No messages received yet.</p>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className="card">
                  <p className="text-sm text-gray-500 mb-1">{msg.date}</p>
                  <p><strong>{msg.name}</strong> ({msg.email})</p>
                  <p className="mt-2 text-gray-700 whitespace-pre-wrap">{msg.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
