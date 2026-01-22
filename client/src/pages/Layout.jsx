import { Link, Outlet } from "react-router-dom";
import useCreator from "../hooks/useCreator";

export default function Layout() {
  const { isCreator, login, logout } = useCreator();

  return (
    <div>
      <nav className="bg-gray-800 text-white p-4 flex justify-between items-center">
        <div className="flex gap-6">
          <Link to="/" className="hover:underline">Home</Link>
          <Link to="/blog" className="hover:underline">Blog</Link>
          <Link to="/curriculum" className="hover:underline">Curriculum</Link>
          <Link to="/vocab" className="hover:underline">Vocab Trainer</Link>
          <Link to="/contact" className="hover:underline">Contact Us</Link>
        </div>

        <div>
          {isCreator ? (
            <button
              onClick={logout}
              className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded"
            >
              Logout
            </button>
          ) : (
            <button
              onClick={login}
              className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded"
            >
              Creator Login
            </button>
          )}
        </div>
      </nav>

      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}
