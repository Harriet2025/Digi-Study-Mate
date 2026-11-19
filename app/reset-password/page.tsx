import AuthLayout from "@/components/auth/AuthLayout";
import { ResetPasswordForm } from "@/components/auth/PasswordResetForms";

export const metadata = { title: "Choose a new password · Study Mate", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthLayout>
      <ResetPasswordForm token={typeof token === "string" ? token : ""} />
    </AuthLayout>
  );
}
