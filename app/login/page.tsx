import AuthForm from "@/components/auth/AuthForm";
import AuthLayout from "@/components/auth/AuthLayout";

export const metadata = { title: "Log in · Study Mate" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <AuthLayout>
      <AuthForm mode="login" next={next} error={error} />
    </AuthLayout>
  );
}
