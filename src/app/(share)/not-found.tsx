import { NotFoundContent } from "@/components/layout/not-found-content";

/**
 * Slice 21 structural audit: without this, an expired/revoked/unknown
 * ShareLink token fell through to the root `not-found.tsx`, duplicating a
 * second "DishFrame" wordmark inside `(share)/layout.tsx`'s own
 * PublicHeader. That layout already provides the `<main>` landmark.
 */
export default function ShareNotFound() {
  return (
    <NotFoundContent
      homeHref="/"
      description="This link may have expired, been revoked, or never existed."
    />
  );
}
