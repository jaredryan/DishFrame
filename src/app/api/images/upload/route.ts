import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import { uploadAndNormalizeImage } from "@/lib/images/service";

/**
 * Slice 6A: the receiving end of the image-upload flow — the browser posts
 * the raw selected file here (via `image-field.tsx`'s `fetch`) instead of
 * uploading directly to Blob with a client token (the pre-Slice-6A
 * pattern). Keeping this as a plain Route Handler rather than a Server
 * Action sidesteps Next's default 1 MB Server Action body-size limit
 * (`serverActions.bodySizeLimit`) without widening that app-wide setting
 * just for this one endpoint — Route Handlers have no equivalent cap of
 * their own, and Vercel Functions accept request bodies up to 100 MB.
 * Auth/ownership/format/size validation and the actual normalize-then-
 * store work all live in `uploadAndNormalizeImage`
 * (`src/lib/images/service.ts`) — this handler only translates the
 * multipart request into that call's plain arguments.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();

    const formData = await request.formData();
    const file = formData.get("file");
    const dishId = formData.get("dishId");

    if (!(file instanceof File)) {
      return Response.json(
        { message: "No image was provided." },
        {
          status: 400,
        },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadAndNormalizeImage(
      userId,
      dishId ? String(dishId) : null,
      {
        name: file.name,
        buffer,
      },
    );

    return Response.json({ status: "success", ...result });
  } catch (error) {
    return Response.json(
      { status: "error", message: toActionErrorMessage(error) },
      { status: 400 },
    );
  }
}
