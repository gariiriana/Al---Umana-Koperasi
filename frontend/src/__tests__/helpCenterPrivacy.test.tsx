import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = { lang: "id" as "id" | "en" };
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ lang: state.lang }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: null }) }));

import { HelpCenterPage } from "@/storefront/pages/HelpCenterPage";

describe("Help page privacy notice (required for invisible Turnstile)", () => {
  it.each(["id", "en"] as const)("links the Cloudflare Turnstile Privacy Addendum (%s)", (lang) => {
    state.lang = lang;
    const { container } = render(<HelpCenterPage />);
    expect(container.querySelector("#privasi")).not.toBeNull();
    const link = screen.getByRole("link", { name: /Turnstile Privacy Addendum/i });
    expect(link.getAttribute("href")).toBe("https://www.cloudflare.com/turnstile-privacy-policy/");
    expect(screen.getByText(/Cloudflare Turnstile/, { selector: "p" })).toBeTruthy();
  });
});
