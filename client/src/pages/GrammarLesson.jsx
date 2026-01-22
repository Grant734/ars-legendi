import { useParams } from "react-router-dom";
import GrammarLessonView from "../grammar/GrammarLessonView";

export default function GrammarLesson() {
  const { lessonKey } = useParams();
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <GrammarLessonView lessonKey={lessonKey} variant="page" />
    </div>
  );
}
