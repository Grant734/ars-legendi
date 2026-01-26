import { useEffect, useState } from "react";
import axios from "axios";
import useCreator from "../hooks/useCreator";
import { apiUrl } from "../lib/api";

const LESSONS = Array.from({ length: 10 }, (_, i) => `Lesson${i + 1}`);

export default function Curriculum() {
  const { isCreator } = useCreator();
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);

  // Load files from backend
  useEffect(() => {
    axios.get(apiUrl("/api/files")).then((res) => {
      setFiles(res.data);
    });
  }, []);

  // Group files by lesson based on filename prefix
  const groupByLesson = () => {
    const grouped = {};
    LESSONS.forEach((lesson) => {
      grouped[lesson] = [];
    });

    files.forEach((file) => {
      const [lesson] = file.split("_");
      if (grouped[lesson]) {
        grouped[lesson].push(file);
      }
    });

    return grouped;
  };

  const groupedFiles = groupByLesson();

  // Upload PDFs
  const handleUpload = async () => {
    const formData = new FormData();
    Array.from(selectedFiles).forEach((file) => formData.append("pdfs", file));

    try {
      await axios.post(apiUrl("/api/upload"), formData);
      const res = await axios.get(apiUrl("/api/files"));
      setFiles(res.data);
      setSelectedFiles([]);
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  // Delete PDF
  const handleDelete = async (filename) => {
    try {
      await axios.delete(apiUrl(`/api/files/${filename}`));
      const res = await axios.get(apiUrl("/api/files"));
      setFiles(res.data);
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  return (
    <div className="p-6 space-y-10">
      <h2 className="text-3xl font-bold text-accent mb-4">Curriculum</h2>

      {isCreator && (
        <div className="space-y-4">
          <input
            type="file"
            multiple
            accept=".pdf"
            onChange={(e) => setSelectedFiles(e.target.files)}
            className="block"
          />
          <button
            onClick={handleUpload}
            className="bg-accent text-white px-4 py-2 rounded hover:bg-yellow-600"
          >
            Upload PDFs
          </button>
          <p className="text-sm text-gray-600 italic">
            To group files correctly, name them like: <code>Lesson1_Reading.pdf</code>
          </p>
        </div>
      )}

      {LESSONS.map((lesson) => (
        <div key={lesson} className="bg-white shadow rounded-xl p-4">
          <h3 className="text-xl font-semibold mb-3">{lesson}</h3>
          {groupedFiles[lesson]?.length ? (
            <ul className="list-disc ml-6 space-y-1">
              {groupedFiles[lesson].map((file) => (
                <li key={file} className="flex justify-between items-center">
                  <a
                    href={apiUrl(`/uploads/${file}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {file}
                  </a>
                  {isCreator && (
                    <button
                      onClick={() => handleDelete(file)}
                      className="ml-4 text-sm text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 italic">No PDFs yet for this lesson.</p>
          )}
        </div>
      ))}
    </div>
  );
}
