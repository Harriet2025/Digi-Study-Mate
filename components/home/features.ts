import { BookOpenText, Headphones, Layers, type LucideIcon, MessageCircleQuestion, Mic, Network, Trophy, Youtube } from "lucide-react";

/** The homepage feature cards (images are real screenshots in public/showcase). */
export const FEATURES: { icon: LucideIcon; title: string; body: string; image: string; alt: string }[] = [
  { icon: BookOpenText, title: "Step-by-step lessons", body: "Plain language, real examples.", image: "lesson", alt: "A lesson step explaining glycolysis in plain language" },
  { icon: Network, title: "Diagrams", body: "See how ideas connect.", image: "diagram", alt: "A flowchart generated from lecture notes" },
  { icon: MessageCircleQuestion, title: "AI tutor", body: "Answers from your own pages.", image: "tutor", alt: "The tutor answering a student's question" },
  { icon: Layers, title: "Flashcards", body: "Spaced repetition that sticks.", image: "flashcard", alt: "A flashcard question" },
  { icon: Trophy, title: "Rated quizzes", body: "Know when you're ready.", image: "quiz", alt: "A multiple-choice quiz question" },
  { icon: Youtube, title: "Videos & reading", body: "Hand-picked YouTube and reading.", image: "resources", alt: "A YouTube video suggestion" },
  { icon: Headphones, title: "Podcast mode", body: "Two hosts explain it aloud.", image: "podcast", alt: "The audio lesson player with a live transcript" },
  { icon: Mic, title: "Question practice", body: "Answer out loud, get graded.", image: "defence", alt: "A tough examiner question" },
];
