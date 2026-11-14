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

  it("hides the mobile sidebar hamburger button for toksan role", () => {
    render(
      <MemoryRouter initialEntries={["/toksan/input"]}>
        <AppShell userRole="toksan" userName="Admin Toksan">
          <p>Isi Toksan</p>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.queryByTitle("Open Sidebar")).toBeNull();
  });

  it("shows the mobile sidebar hamburger button for other roles (e.g. admin)", () => {
    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <AppShell userRole="admin" userName="Admin">
          <p>Isi Admin</p>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByTitle("Open Sidebar")).toBeTruthy();
  });

  it("keeps the hamburger for super_admin even on a Toksan page (else Lainnya/menu is unreachable)", () => {
    render(
      <MemoryRouter initialEntries={["/toksan/input"]}>
        <AppShell userRole="super_admin" userName="Gari">
          <p>Isi Toksan</p>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByTitle("Open Sidebar")).toBeTruthy();
  });
});
