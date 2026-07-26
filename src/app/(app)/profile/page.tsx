import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getServerSession } from "@/lib/auth/session";
import { ProfileActions } from "@/components/app/profile-actions";

export const metadata: Metadata = {
  title: "Profile",
};

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export default async function ProfilePage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const { user } = session;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Profile
        </h1>
        <p className="text-muted-foreground mt-2">Your account details.</p>
      </div>

      <div className="border-border bg-card flex items-center gap-4 rounded-xl border p-5">
        <Avatar size="lg">
          <AvatarImage src={user.image ?? undefined} alt="" />
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-foreground font-medium">{user.name}</p>
          <p className="text-muted-foreground text-sm">{user.email}</p>
        </div>
      </div>

      <ProfileActions />
    </div>
  );
}
