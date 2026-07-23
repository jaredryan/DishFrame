import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { isGoogleAuthConfigured } from "@/lib/env/server";
import { SignInCard } from "@/components/auth/sign-in-card";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to access your DishFrame recipes, reusable parts, and cooking history.",
  robots: {
    index: false,
    follow: false,
  },
};

const ERROR_MESSAGES: Record<string, string> = {
  oauth_config: "Google sign-in isn't configured yet.",
  access_denied: "Sign-in was cancelled.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession();
  if (session) {
    redirect("/home");
  }

  const params = await searchParams;
  const rawError = params.error;
  const errorCode = Array.isArray(rawError) ? rawError[0] : rawError;
  const initialError = errorCode
    ? (ERROR_MESSAGES[errorCode] ??
      "Couldn't sign in with Google. Please try again.")
    : undefined;

  return (
    <SignInCard
      googleConfigured={isGoogleAuthConfigured}
      initialError={initialError}
    />
  );
}
