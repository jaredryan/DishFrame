import type { Metadata, Viewport } from "next";
import { Manrope, Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import { ServiceWorkerRegister } from "@/components/offline/sw-register";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: "%s · DishFrame",
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  verification: {
    google: "wxjicYgLC0cT9z0aEKqgXNFP8EK2S57ujrraQqOHmz4",
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#252932" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Deliberately no `getServerSession()` call here: this layout wraps
  // every route including statically-generated marketing pages, and
  // `getServerSession()` calls `headers()`, which would force the whole
  // site dynamic just to support an edge case. Account-isolation
  // reconciliation (`OfflineAccountBoot`) instead runs from
  // `(app)/layout.tsx` (already dynamic, already holds the session) for
  // the authenticated case, and from the sign-in page for the
  // unauthenticated case — reaching sign-in always means "not
  // authenticated," whether freshly arrived or redirected here by
  // `(app)/layout.tsx`'s own session check, so that's the one place an
  // unauthenticated boot is guaranteed to pass through (docs/
  // OFFLINE_IMPLEMENTATION_PLAN.md §6.2).
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col overflow-x-hidden">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ToastProvider>
            <ServiceWorkerRegister />
            {children}
            <Toaster />
          </ToastProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
