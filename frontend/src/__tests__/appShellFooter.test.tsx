import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ lang: "id", setLang: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, profile: { role: "toksan" } }) }));
vi.mock("@/services/notificationService", () => ({ subscribeUnreadCount: () => () => {} }));
vi.mock("@/components/layout/Sidebar", () => ({ Sidebar: () => <nav aria-label="sidebar" /> }));
vi.mock("@/components/layout/MobileNav", () => ({ MobileNav: () => null }));

import { AppShell } from "@/components/layout/AppShell";

describe("staff AppShell", () => {
  it("shows the page without the public website footer", () => {
    render(
      <MemoryRouter>
        <AppShell userRole="toksan" userName="Admin Toksan">
          <p>Isi halaman</p>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByText("Isi halaman")).toBeTruthy();
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.queryByText("Hubungi Kami")).toBeNull();
  });
});
