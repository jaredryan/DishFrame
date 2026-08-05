import { NotFoundContent } from "@/components/layout/not-found-content";

/**
 * Slice 21 structural audit: without this, a 404 thrown by any `(app)`
 * page (deleted Recipe/Part, stale Meal Plan/grocery list link, etc.)
 * fell through to the root `not-found.tsx`, which renders its own
 * header/Wordmark *inside* `(app)/layout.tsx`'s already-rendered
 * SidebarNav/MobileTopbar — a duplicated-branding page. `(app)/layout.tsx`
 * already provides the `<main>` landmark, so this renders content only.
 */
export default function AppNotFound() {
  return <NotFoundContent homeHref="/home" />;
}
