import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  it("declares the DishFrame identity and no service-worker capabilities", () => {
    const result = manifest();

    expect(result.name).toBe("DishFrame");
    expect(result.short_name).toBe("DishFrame");
    expect(result.start_url).toBe("/home");
    expect(result.scope).toBe("/");
    expect(result.display).toBe("standalone");
    expect(result.icons?.length).toBeGreaterThan(0);
  });
});
