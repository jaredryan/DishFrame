import { z } from "zod";

export const revokeAuthSessionSchema = z.object({
  sessionId: z.string().min(1, "Missing session id."),
});

export const deleteAccountSchema = z.object({
  confirmEmail: z.string().min(1, "Type your account email to confirm."),
});

export type RevokeAuthSessionInput = z.infer<typeof revokeAuthSessionSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
