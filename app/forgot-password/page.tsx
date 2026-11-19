import AuthLayout from "@/components/auth/AuthLayout";
import { ForgotPasswordForm } from "@/components/auth/PasswordResetForms";

export const metadata = { title: "Forgot password · Study Mate" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
