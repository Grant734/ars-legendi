import { Link, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth.jsx';

export default function Navbar() {
  const location = useLocation();
  const { user, isLoggedIn, isTeacher, logout } = useAuth();

  const navLinks = [
    { name: 'Vocab', path: '/CaesarDBG1' },
    { name: 'Reading', path: '/reading-guide' },
    { name: 'Lessons', path: '/grammar' },
    { name: 'Practice', path: '/grammar-practice' },
    { name: 'Mastery', path: '/mastery' },
    { name: 'Methodology', path: '/methodology' },
  ];

  return (
    <nav className="bg-primary text-white shadow-md sticky top-0 z-50">
      <div className="container mx-auto flex justify-between items-center py-4 px-6 gap-8">
        <Link to="/" className="text-xl font-bold tracking-tight text-accent hover:bg-accent/15 px-2 py-1 -mx-2 -my-1 rounded transition-colors shrink-0">
          Ars Legendi - About
        </Link>

        <div className="flex gap-2 items-center">
          {navLinks.map(link => (
            <Link
              key={link.name}
              to={link.path}
              className={`text-accent px-2 py-1 rounded transition-colors hover:bg-accent/15 ${
                location.pathname === link.path ? 'font-semibold bg-accent/10' : ''
              }`}
            >
              {link.name}
            </Link>
          ))}

          {/* Teacher Dashboard link - show when logged in as teacher */}
          {isLoggedIn && isTeacher && (
            <Link
              to="/teacher-classes"
              className={`text-accent px-2 py-1 rounded transition-colors hover:bg-accent/15 ${
                location.pathname.startsWith('/teacher-class') ? 'font-semibold bg-accent/10' : ''
              }`}
            >
              Teacher Dashboard
            </Link>
          )}

          {/* Auth buttons */}
          {isLoggedIn ? (
            <div className="flex items-center gap-3">
              {!isTeacher && (
                <Link
                  to="/profile"
                  className="text-sm text-gray-300 hover:text-white transition-colors"
                >
                  {user?.displayName || 'Profile'}
                </Link>
              )}
              <button
                className="text-sm bg-accent hover:bg-yellow-400 px-3 py-1 rounded text-primary font-medium transition-colors"
                onClick={logout}
              >
                Log Out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="text-sm bg-accent hover:bg-yellow-400 px-3 py-1 rounded text-primary font-medium transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
