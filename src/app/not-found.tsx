import type { Metadata } from "next";
import { Wordmark } from "@/components/branding/wordmark";
import { NotFoundContent } from "@/components/layout/not-found-content";
import { PublicFooter } from "@/components/layout/public-footer";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="bg-surface-subtle flex min-h-screen flex-col">
      <header className="flex items-center px-4 py-6 sm:px-6 lg:px-8">
        <Wordmark />
      </header>
      <NotFoundContent as="main" homeHref="/" />
      <PublicFooter />
    </div>
  );
}
