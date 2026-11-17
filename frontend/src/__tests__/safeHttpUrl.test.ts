import { describe, it, expect } from "vitest";
import { safeHttpUrl } from "@/lib/validators";

describe("safeHttpUrl", () => {
  it("keeps http and https links", () => {
    expect(safeHttpUrl("https://maps.app.goo.gl/abc123")).toBe("https://maps.app.goo.gl/abc123");
    expect(safeHttpUrl("  http://maps.google.com/?q=-6.9,107.6 ")).toBe("http://maps.google.com/?q=-6.9,107.6");
  });

  it("rejects script and other schemes a customer could put in an address", () => {
    expect(safeHttpUrl("javascript:alert(document.cookie)")).toBeNull();
    expect(safeHttpUrl(" JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeHttpUrl("java\nscript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHttpUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeHttpUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects text that is not a link", () => {
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl("-")).toBeNull();
    expect(safeHttpUrl("dekat masjid")).toBeNull();
    expect(safeHttpUrl("//evil.example/x")).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});
