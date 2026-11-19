import LegalPage from "@/components/legal/LegalPage";

export const metadata = { title: "Privacy · Study Mate" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="19 November 2026">
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Your name and email address, and a scrambled (hashed) version of your password. We never store the password itself.</li>
          <li>If you sign in with Google: your Google name, email and profile picture.</li>
          <li>The files you upload, and what Study Mate makes from them: lessons, flashcards, quizzes, chats, audio and slides.</li>
          <li>Your study activity (quiz scores, flashcard reviews, listening time) so we can show your progress and streaks.</li>
        </ul>
      </section>
      <section>
        <h2>How we use it</h2>
        <p>Only to run Study Mate for you: making your lessons, saving your progress and keeping you signed in. We don&apos;t sell your data or show you ads.</p>
      </section>
      <section>
        <h2>Who else processes it</h2>
        <ul>
          <li><strong>Groq</strong> runs the AI that writes lessons, answers questions and grades practice answers. It receives the text of your notes and questions.</li>
          <li><strong>ElevenLabs</strong> creates the voices for audio lessons. It receives the lesson script.</li>
          <li><strong>Vercel</strong> hosts the website and <strong>Railway</strong> hosts the server, database and files.</li>
          <li><strong>Google</strong>, only if you choose “Continue with Google”.</li>
        </ul>
      </section>
      <section>
        <h2>Who can see your work</h2>
        <p>Only you. Every lesson, file and score is tied to your account, and other users can&apos;t open it, even with a link.</p>
      </section>
      <section>
        <h2>Free trials</h2>
        <p>If you upload before creating an account, your trial lesson is kept for 7 days. Create an account to keep it; otherwise it&apos;s deleted automatically.</p>
      </section>
      <section>
        <h2>Deleting your data</h2>
        <p>You can delete any upload, lesson or project from your library at any time, which removes everything made from it.</p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>We use one essential cookie to keep you signed in. There are no tracking or advertising cookies.</p>
      </section>
    </LegalPage>
  );
}
