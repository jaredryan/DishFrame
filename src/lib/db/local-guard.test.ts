import { describe, it, expect } from "vitest";
import { assertLocalDatabaseEnv } from "@/lib/db/local-guard";

const LOCAL = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/dishframe",
  DIRECT_URL: "postgresql://postgres:postgres@localhost:5432/dishframe_shadow",
  DATABASE_DRIVER: "pg",
};

describe("assertLocalDatabaseEnv", () => {
  it("accepts the standard local docker-compose configuration", () => {
    expect(() => assertLocalDatabaseEnv(LOCAL)).not.toThrow();
  });

  it("accepts 127.0.0.1 and ::1 as local hosts", () => {
    expect(() =>
      assertLocalDatabaseEnv({
        ...LOCAL,
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/dishframe",
      }),
    ).not.toThrow();
    expect(() =>
      assertLocalDatabaseEnv({
        ...LOCAL,
        DATABASE_URL: "postgresql://postgres:postgres@[::1]:5432/dishframe",
      }),
    ).not.toThrow();
  });

  it("rejects DATABASE_DRIVER=neon even with a localhost URL", () => {
    expect(() =>
      assertLocalDatabaseEnv({ ...LOCAL, DATABASE_DRIVER: "neon" }),
    ).toThrow(/DATABASE_DRIVER/);
  });

  it("rejects a missing DATABASE_DRIVER", () => {
    expect(() =>
      assertLocalDatabaseEnv({ ...LOCAL, DATABASE_DRIVER: undefined }),
    ).toThrow(/DATABASE_DRIVER/);
  });

  it("rejects a remote Neon hostname even if DATABASE_DRIVER were forced to pg", () => {
    expect(() =>
      assertLocalDatabaseEnv({
        ...LOCAL,
        DATABASE_URL:
          "postgresql://user:pw@ep-example-pooler.us-east-2.aws.neon.tech/dishframe?sslmode=require",
      }),
    ).toThrow(/neon\.tech/);
  });

  it("rejects a non-local hostname that isn't neon.tech either", () => {
    expect(() =>
      assertLocalDatabaseEnv({
        ...LOCAL,
        DATABASE_URL: "postgresql://user:pw@db.example.com:5432/dishframe",
      }),
    ).toThrow(/local/i);
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() =>
      assertLocalDatabaseEnv({ ...LOCAL, DATABASE_URL: undefined }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects DIRECT_URL pointing somewhere non-local even if DATABASE_URL is local", () => {
    expect(() =>
      assertLocalDatabaseEnv({
        ...LOCAL,
        DIRECT_URL: "postgresql://user:pw@db.example.com:5432/dishframe_shadow",
      }),
    ).toThrow(/local/i);
  });

  it("rejects an unparseable URL", () => {
    expect(() =>
      assertLocalDatabaseEnv({ ...LOCAL, DATABASE_URL: "not-a-url" }),
    ).toThrow();
  });
});
