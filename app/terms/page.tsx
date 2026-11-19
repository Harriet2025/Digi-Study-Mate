import LegalPage from "@/components/legal/LegalPage";

export const metadata = { title: "Terms · Study Mate" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="19 November 2026">
      <section>
        <h2>Using Study Mate</h2>
        <p>Study Mate helps you understand and revise your own course material. You&apos;re responsible for what you upload: only upload material you&apos;re allowed to use, such as your own notes and slides your course has shared with you.</p>
      </section>
      <section>
        <h2>Academic honesty</h2>
        <p>Lessons, draft slides and model answers are study aids. Check your university&apos;s rules on AI tools, make submitted work your own, and don&apos;t present generated content as yours where that isn&apos;t allowed.</p>
      </section>
      <section>
        <h2>AI can make mistakes</h2>
        <p>Study Mate bases its answers on your material and cites your pages, but AI can still get things wrong. Check important facts against your notes and lecturers.</p>
      </section>
      <section>
        <h2>Beta</h2>
        <p>Study Mate is free while in beta. Features and limits may change, and we&apos;ll tell you before anything you rely on stops being free.</p>
      </section>
      <section>
        <h2>Your account</h2>
        <p>Keep your password private. We may suspend accounts that misuse the service, for example by uploading harmful content or trying to access other people&apos;s data.</p>
      </section>
    </LegalPage>
  );
}
