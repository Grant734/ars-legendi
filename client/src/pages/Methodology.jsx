import { Link } from "react-router-dom";
import TextSelector from "../components/TextSelector";

export default function Methodology() {
  return (
    <>
      <TextSelector className="-mx-6 -mt-6 mb-6" />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-primary mb-4">Methodology</h1>
        <p className="text-gray-600 mb-6">
          This page will explain the pedagogical framework and technical
          implementation of Ars Legendi.
        </p>
        <div className="bg-white border-2 border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500 italic">Coming soon</p>
        </div>
        <div className="mt-6">
          <Link to="/" className="text-accent hover:underline font-medium">
            ← Back to Home
          </Link>
        </div>
      </div>
    </>
  );
}
