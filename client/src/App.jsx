import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import { AuthProvider } from './hooks/useAuth.jsx';
import { TextProvider } from './components/TextSelector';
import Home from './pages/Home';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import NewPost from './pages/NewPost';
import EditPost from './pages/EditPost';
import Curriculum from './pages/Curriculum';
import Contact from './pages/Contact';
import VocabTrainer from './vocab/VocabTrainer';
import CaesarDBG1 from "./pages/CaesarDBG1";
import ReadingGuideDebug from './pages/ReadingGuideDebug';
import ReadingGuide from './pages/ReadingGuide';
import GrammarLessons from "./pages/GrammarLessons";
import GrammarLesson from "./pages/GrammarLesson";
import GrammarPractice from './pages/GrammarPractice';
import MasteryPage from './pages/MasteryPage';
import TeachingEthos from './pages/TeachingEthos';
import Login from './pages/Login';
import StudentProfile from './pages/StudentProfile';
import TeacherClasses from './pages/TeacherClasses';
import TeacherClassView from './pages/TeacherClassView';
import Methodology from './pages/Methodology';


function App() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <AuthProvider>
      <TextProvider>
        <div className="min-h-screen">
          <Navbar />
          <main className={isHome ? '' : 'pt-6 pb-12'}>
            <div className={isHome ? '' : 'max-w-7xl mx-auto px-6'}>
              <Routes>
              <Route path="/CaesarDBG1" element={<CaesarDBG1 />} />
              <Route path="/" element={<Home />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/blog/new" element={<NewPost />} />
              <Route path="/blog/edit/:slug" element={<EditPost />} />
              <Route path="/curriculum" element={<Curriculum />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/vocab" element={<VocabTrainer />} />
              <Route path="/reading-debug" element={<ReadingGuideDebug />} />
              <Route path="/reading-guide" element={<ReadingGuide />} />
              <Route path="/grammar" element={<GrammarLessons />} />
              <Route path="/grammar/:lessonKey" element={<GrammarLesson />} />
              <Route path="/grammar-practice" element={<GrammarPractice />} />
              <Route path="/mastery" element={<MasteryPage />} />
              <Route path="/about-learning" element={<TeachingEthos />} />
              <Route path="/methodology" element={<Methodology />} />
              {/* Auth routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/profile" element={<StudentProfile />} />
              <Route path="/teacher-classes" element={<TeacherClasses />} />
              <Route path="/teacher-class/:id" element={<TeacherClassView />} />
              </Routes>
            </div>
          </main>
        </div>
      </TextProvider>
    </AuthProvider>
  );
}

export default App;
