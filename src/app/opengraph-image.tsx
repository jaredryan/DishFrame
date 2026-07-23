import { renderSocialImage, socialImageSize } from "@/lib/og/social-image";

export const alt = "DishFrame — A better framework for the way you cook";
export const size = socialImageSize;
export const contentType = "image/png";

export default function Image() {
  return renderSocialImage();
}
