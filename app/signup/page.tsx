import AuthForm from "@/components/auth/AuthForm";
import AuthLayout from "@/components/auth/AuthLayout";

export const metadata = { title: "Create your account · Study Mate" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <AuthLayout>
      <AuthForm mode="signup" next={next} error={error} />
    </AuthLayout>
  );
}
