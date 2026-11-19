import AuthForm from "@/components/auth/AuthForm";
import AuthLayout from "@/components/auth/AuthLayout";

export const metadata = { title: "Log in · Study Mate" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; reason?: string }> }) {
  const { next, error, reason } = await searchParams;
  return (
    <AuthLayout>
      <AuthForm mode="login" next={next} error={error} reason={reason} />
    </AuthLayout>
  );
}
