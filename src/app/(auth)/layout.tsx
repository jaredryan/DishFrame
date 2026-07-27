import { Wordmark } from "@/components/branding/wordmark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-subtle flex min-h-screen flex-col">
      <header className="flex items-center px-4 py-6 sm:px-6 lg:px-8">
        <Wordmark />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        {children}
      </main>
    </div>
  );
}
