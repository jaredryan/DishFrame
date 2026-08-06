"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  revokeAuthSessionAction,
  revokeOtherAuthSessionsAction,
} from "@/lib/account/actions";
import { ReauthenticatePrompt } from "@/components/app/reauthenticate-prompt";
import type { AuthSessionSummary } from "@/lib/account/service";

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * PRODUCT_SPEC.md §89: initial list comes from the server component that
 * renders `/profile` (Better Auth's `listSessions` requires a fresh
 * session, so the "needs reauth" state is decided there); this component
 * only handles revoke interactions and refreshes the page afterward,
 * matching `ShareLinkList`'s pattern.
 */
export function AuthSessionManager({
  status,
  sessions,
}: {
  status: "ready" | "needs_reauth";
  sessions: AuthSessionSummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);

  if (status === "needs_reauth") {
    return (
      <ReauthenticatePrompt reason="View and manage your signed-in devices." />
    );
  }

  function handleRevoke(sessionId: string) {
    setError(null);
    setRevokingId(sessionId);
    startTransition(async () => {
      const result = await revokeAuthSessionAction({ sessionId });
      if (result.status === "success") {
        router.refresh();
      } else {
        setError(result.message);
      }
      setRevokingId(null);
    });
  }

  function handleRevokeOthers() {
    setError(null);
    startTransition(async () => {
      const result = await revokeOtherAuthSessionsAction();
      if (result.status === "success") {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  const hasOtherSessions = sessions.some((s) => !s.isCurrent);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="border-border flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="text-foreground text-sm font-medium">
                  {s.description}
                </p>
                {s.isCurrent && <Badge variant="outline">This device</Badge>}
              </div>
              <p className="text-muted-foreground text-sm">
                Active {formatRelative(s.lastActiveAt)}
              </p>
            </div>
            {!s.isCurrent && (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => handleRevoke(s.id)}
              >
                {revokingId === s.id ? "Signing out…" : "Sign out"}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {error && <p className="text-destructive-text text-sm">{error}</p>}

      {hasOtherSessions && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={isPending}
          onClick={handleRevokeOthers}
        >
          Sign out all other devices
        </Button>
      )}
    </div>
  );
}
