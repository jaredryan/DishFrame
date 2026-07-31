import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, FormProvider } from "react-hook-form";
import { ImageField } from "@/components/domain/dish/image-field";

function Harness({ initialImageAssetId = null as string | null }) {
  const form = useForm({
    defaultValues: { imageAssetId: initialImageAssetId },
  });
  return (
    <FormProvider {...form}>
      <ImageField dishId={null} />
    </FormProvider>
  );
}

/**
 * Slice 6A: uploads now post to `/api/images/upload` (mocked here via
 * `global.fetch`) instead of a Server Action + client-direct-to-Blob
 * `put()` — the earlier signed-token flow never gave the server a chance
 * to see the bytes, which normalization (Slice 6A) requires.
 *
 * Design remediation pass: `/api/images/[assetId]` only authorizes a read
 * once some saved DishVersion actually references the asset — true for an
 * already-persisted image, but never true yet for a file the user just
 * selected (its ImageAsset row is reserved, but no DishVersion points at it
 * until the overall Save). Regression coverage for the fix: the preview
 * must come from a local `blob:` object URL until Save, not the
 * authorized route.
 */
describe("ImageField", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({ status: "success", imageAssetId: "new-asset-1" }),
    });
    URL.createObjectURL = vi.fn(() => "blob:mock-preview-url");
    URL.revokeObjectURL = vi.fn();
  });

  it("previews a newly selected first image via a local object URL, not the authorized route", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const file = new File(["fake-bytes"], "photo.jpg", {
      type: "image/jpeg",
    });
    const input = document.querySelector('input[type="file"]')!;
    await user.upload(input as HTMLInputElement, file);

    // The preview <img> is deliberately `alt=""` (decorative), so it's
    // outside the accessibility tree — queried directly rather than via
    // `getByRole`, same as the existing image-preview markup elsewhere.
    const preview = await vi.waitFor(() => {
      const el = document.querySelector("img");
      if (!el) throw new Error("preview not rendered yet");
      return el;
    });
    expect(preview).toHaveAttribute("src", "blob:mock-preview-url");
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);

    // The upload still completes and persists the real asset id — only the
    // *preview source* changed, not the persistence flow.
    await vi.waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/images/upload",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("revokes the object URL when the image is removed", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const file = new File(["fake-bytes"], "photo.jpg", {
      type: "image/jpeg",
    });
    const input = document.querySelector('input[type="file"]')!;
    await user.upload(input as HTMLInputElement, file);
    await vi.waitFor(() => {
      if (!document.querySelector("img")) throw new Error("not rendered yet");
    });

    await user.click(screen.getByRole("button", { name: "Remove photo" }));

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-preview-url");
    expect(document.querySelector("img")).toBeNull();
  });

  it("previews an already-persisted image through the authorized route", () => {
    render(<Harness initialImageAssetId="existing-asset-1" />);

    const preview = document.querySelector("img");
    expect(preview).toHaveAttribute("src", "/api/images/existing-asset-1");
  });
});
