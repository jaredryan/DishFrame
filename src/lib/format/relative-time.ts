/** Compact "time since" text (e.g. "3 hours ago") shared by the Home
 * dashboard and Cook page for lightweight session/update timing. */
export function formatRelativeAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
