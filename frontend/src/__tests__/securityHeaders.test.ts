/**
 * Guards the security headers Firebase Hosting sends (firebase.json at the repo root).
 * If a new external domain is needed, add it to the CSP on purpose and update this test.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface HeaderRule { source?: string; regex?: string; headers: { key: string; value: string }[] }
const firebaseJson = JSON.parse(readFileSync(resolve(__dirname, "../../../firebase.json"), "utf8")) as {
  hosting: { headers: HeaderRule[] };
};

const globalRule = firebaseJson.hosting.headers.find((rule) => rule.source === "**");
const header = (key: string) => globalRule?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const [name, ...sources] = part.split(/\s+/);
      return [name, sources];
    }),
  );
}

describe("security headers (firebase.json)", () => {
  it("applies to every path", () => {
    expect(globalRule).toBeDefined();
  });

  it("sends the basic hardening headers", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    const permissions = header("Permissions-Policy") ?? "";
    expect(permissions).toContain("camera=(self)");
    expect(permissions).toContain("geolocation=(self)");
    expect(permissions).toContain("microphone=()");
  });

  it("ships CSP in exactly one mode (report-only first, then enforced)", () => {
    const enforced = header("Content-Security-Policy");
    const reportOnly = header("Content-Security-Policy-Report-Only");
    expect(Boolean(enforced) !== Boolean(reportOnly)).toBe(true);
  });

  it("CSP blocks the dangerous things", () => {
    const csp = directives(header("Content-Security-Policy") ?? header("Content-Security-Policy-Report-Only") ?? "");
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
    expect(csp["frame-ancestors"]).toEqual(["'self'"]);
    // No inline or eval'd scripts, and no wildcard script hosts.
    expect(csp["script-src"]).not.toContain("'unsafe-inline'");
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
    expect(csp["script-src"].some((s) => s === "https:" || s === "*" || s.includes("*"))).toBe(false);
  });

  it("CSP allows every service the app really uses", () => {
    const csp = directives(header("Content-Security-Policy") ?? header("Content-Security-Policy-Report-Only") ?? "");
    expect(csp["script-src"]).toEqual(expect.arrayContaining([
      "'self'", "https://challenges.cloudflare.com", "https://unpkg.com/leaflet@1.9.4/", "https://www.googletagmanager.com",
    ]));
    expect(csp["connect-src"]).toEqual(expect.arrayContaining([
      "'self'", "https://koperasi-alumana.com", "https://*.googleapis.com", "https://challenges.cloudflare.com",
      "https://nominatim.openstreetmap.org", "https://worldtimeapi.org", "https://docs.google.com",
      "https://*.googleusercontent.com", "https://*.google-analytics.com", "data:", "blob:",
    ]));
    expect(csp["frame-src"]).toEqual(expect.arrayContaining(["https://challenges.cloudflare.com"]));
    expect(csp["style-src"]).toEqual(expect.arrayContaining(["https://fonts.googleapis.com", "https://unpkg.com/leaflet@1.9.4/"]));
    expect(csp["font-src"]).toEqual(expect.arrayContaining(["https://fonts.gstatic.com"]));
    expect(csp["img-src"]).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", "https:"]));
    expect(csp["worker-src"]).toEqual(expect.arrayContaining(["'self'"]));
    // Hero video on the login / landing pages.
    expect(csp["media-src"]).toEqual(expect.arrayContaining(["'self'", "blob:", "https://www.alumanaa.com"]));
  });

  it("CSP violations are reported to the push Worker", () => {
    const csp = directives(header("Content-Security-Policy") ?? header("Content-Security-Policy-Report-Only") ?? "");
    expect(csp["report-uri"]).toEqual(["https://koperasi-alumana.com/api/security/csp-report"]);
    expect(csp["report-to"]).toEqual(["csp"]);
    expect(header("Reporting-Endpoints")).toBe('csp="https://koperasi-alumana.com/api/security/csp-report"');
  });
});
