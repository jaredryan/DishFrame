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

/**
 * Only a same-origin relative path is ever honored — never a scheme-
 * relative ("//evil.com") or absolute URL, which would otherwise let an
 * attacker-controlled `redirectTo` param send a signed-in user off-site
 * (an open-redirect risk this app's own auth flow must not introduce).
 */
function safeRedirectTarget(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/home";
  return raw;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectTo = safeRedirectTarget(params.redirectTo);

  const session = await getServerSession();
  if (session) {
    redirect(redirectTo);
  }

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
      callbackURL={redirectTo}
    />
  );
}
