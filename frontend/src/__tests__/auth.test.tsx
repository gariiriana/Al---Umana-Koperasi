import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import type { ReactNode, HTMLAttributes } from "react";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppRouter } from "@/router/AppRouter";

// Mock variables (must be prefixed with mock for Vitest hoisting)
let mockCurrentUser: Record<string, unknown> | null = null;
let mockDocSnapshotExists = true;
let mockUserProfileData = {
  email: "monitoring@alumana.id",
  displayName: "Monitoring User",
  role: "monitoring",
};

// Mock Firebase SDKs
vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({})),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  updateProfile: vi.fn(),
  onAuthStateChanged: vi.fn((_auth, cb) => {
    cb(mockCurrentUser);
    return () => {};
  }),
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn((_ref, cb: (snapshot: unknown) => void) => {
    cb({
      exists: () => mockDocSnapshotExists,
      data: () => mockUserProfileData,
    });
    return () => {};
  }),
}));

// Mock services
vi.mock("../services/authService", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  sendPasswordReset: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn((cb) => {
    cb(mockCurrentUser);
    return () => {};
  }),
}));

vi.mock("../services/realtimeService", () => ({
  subscribeOrders: vi.fn((listener) => {
    listener([]);
    return () => {};
  }),
  subscribeOrdersByStatus: vi.fn((_status, listener) => {
    listener([]);
    return () => {};
  }),
  subscribeOrder: vi.fn((_id, listener) => {
    listener(null);
    return () => {};
  }),
  subscribeCourierLocations: vi.fn((listener) => {
    listener([]);
    return () => {};
  }),
  subscribeOrderLocation: vi.fn((_o, _c, listener) => {
    listener(null);
    return () => {};
  }),
  subscribeOrderFiles: vi.fn((_o, listener) => {
    listener([]);
    return () => {};
  }),
}));

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, className, onClick, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div className={className} onClick={onClick} {...props}>
        {children}
      </div>
    ),
    span: ({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
      <span className={className} {...props}>
        {children}
      </span>
    ),
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("Authentication UI Features", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should toggle password visibility on LoginPage", () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </BrowserRouter>
    );

    const passwordInput = screen.getByPlaceholderText("••••••••") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    // Get the show/hide password toggle button
    const toggleButton = screen.getByLabelText("Toggle password visibility");
    fireEvent.click(toggleButton);

    expect(passwordInput.type).toBe("text");

    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe("password");
  });

  it("should render links to register and forgot-password on LoginPage", () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByText("Forgot password?")).toBeDefined();
    expect(screen.getByText("Register")).toBeDefined();
  });

  it("should toggle password visibility on RegisterPage", () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </BrowserRouter>
    );

    const passwordInput = screen.getByPlaceholderText("Create password") as HTMLInputElement;
    const confirmInput = screen.getByPlaceholderText("Confirm password") as HTMLInputElement;

    expect(passwordInput.type).toBe("password");
    expect(confirmInput.type).toBe("password");

    const toggleButtons = screen.getAllByLabelText("Toggle password visibility");
    expect(toggleButtons.length).toBe(2);

    // Toggle password
    fireEvent.click(toggleButtons[0]);
    expect(passwordInput.type).toBe("text");
    expect(confirmInput.type).toBe("password");

    // Toggle confirm password
    fireEvent.click(toggleButtons[1]);
    expect(confirmInput.type).toBe("text");
  });

  it("should show validation error when passwords do not match on RegisterPage", async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </BrowserRouter>
    );

    const nameInput = screen.getByPlaceholderText("Your Full Name");
    const emailInput = screen.getByPlaceholderText("you@al-umana.id");
    const passwordInput = screen.getByPlaceholderText("Create password");
    const confirmInput = screen.getByPlaceholderText("Confirm password");
    const submitBtn = screen.getByRole("button", { name: /Register/i });

    fireEvent.change(nameInput, { target: { value: "John Doe" } });
    fireEvent.change(emailInput, { target: { value: "john@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.change(confirmInput, { target: { value: "password456" } });

    fireEvent.click(submitBtn);

    expect(await screen.findByText("Passwords do not match")).toBeDefined();
  });

  it("should render ForgotPasswordPage and display success message on submission", async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <ForgotPasswordPage />
        </AuthProvider>
      </BrowserRouter>
    );

    const emailInput = screen.getByPlaceholderText("you@al-umana.id");
    const submitBtn = screen.getByRole("button", { name: /Reset Password/i });

    fireEvent.change(emailInput, { target: { value: "john@example.com" } });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Password reset link has been sent/i)).toBeDefined();
  });

  describe("Logout Confirmation Modal Flow", () => {
    beforeEach(() => {
      mockCurrentUser = {
        email: "monitoring@alumana.id",
        uid: "test-uid-123",
        displayName: "Monitoring User",
      };
      mockDocSnapshotExists = true;
      mockUserProfileData = {
        email: "monitoring@alumana.id",
        displayName: "Monitoring User",
        role: "monitoring",
      };
      window.history.pushState({}, "", "/dashboard");
    });

    afterEach(() => {
      mockCurrentUser = null;
    });

    it("should display confirmation modal when sign out is clicked in Sidebar", async () => {
      render(<AppRouter />);

      // Verify the page has loaded (loading overlay is gone)
      expect(screen.queryByText("Loading…")).toBeNull();

      // Find the Sign out button in Sidebar
      const signOutBtn = screen.getByRole("button", { name: /Sign out/i });
      expect(signOutBtn).toBeDefined();

      // Modal should not be visible initially
      expect(screen.queryByText("Konfirmasi Keluar")).toBeNull();

      // Click sign out
      fireEvent.click(signOutBtn);

      // Modal should now be visible
      expect(screen.getByText("Konfirmasi Keluar")).toBeDefined();
      expect(screen.getByText("Apakah Anda yakin ingin keluar dari akun Anda?")).toBeDefined();

      // Find Cancel ("Batal") button
      const cancelBtn = screen.getByRole("button", { name: /Batal/i });
      fireEvent.click(cancelBtn);

      // Modal should be closed
      expect(screen.queryByText("Konfirmasi Keluar")).toBeNull();
      
      // authService.signOut should NOT have been called
      const authService = await import("../services/authService");
      expect(authService.signOut).not.toHaveBeenCalled();

      // Open modal again
      fireEvent.click(signOutBtn);
      expect(screen.getByText("Konfirmasi Keluar")).toBeDefined();

      // Find Confirm ("Keluar") button
      const confirmBtn = screen.getByRole("button", { name: /Keluar/i });
      fireEvent.click(confirmBtn);

      // Modal should be closed and signOut called
      expect(screen.queryByText("Konfirmasi Keluar")).toBeNull();
      expect(authService.signOut).toHaveBeenCalled();
    });

    it("should display confirmation modal when sign out is clicked in SettingsPage", async () => {
      // Go to settings page
      window.history.pushState({}, "", "/settings");
      render(<AppRouter />);

      // Find Sign out button in SettingsPage
      const settingsSignOutBtn = screen.getAllByRole("button", { name: /Sign out/i })[1];
      
      // Click sign out in settings page
      fireEvent.click(settingsSignOutBtn);

      // Modal should show
      expect(screen.getByText("Konfirmasi Keluar")).toBeDefined();

      // Click "Batal"
      const cancelBtn = screen.getByRole("button", { name: /Batal/i });
      fireEvent.click(cancelBtn);
      expect(screen.queryByText("Konfirmasi Keluar")).toBeNull();

      const authService = await import("../services/authService");
      expect(authService.signOut).not.toHaveBeenCalled();
    });
  });

  describe("Role-Based Access Control (RBAC) Flow", () => {
    beforeEach(() => {
      mockCurrentUser = {
        email: "monitoring@alumana.id",
        uid: "test-uid-123",
        displayName: "Monitoring User",
      };
      mockDocSnapshotExists = true;
      mockUserProfileData = {
        email: "monitoring@alumana.id",
        displayName: "Monitoring User",
        role: "monitoring",
      };
      window.history.pushState({}, "", "/dashboard");
    });

    afterEach(() => {
      mockCurrentUser = null;
    });

    it("should filter navigation links for monitoring role", async () => {
      render(<AppRouter />);

      await waitFor(() => {
        // Monitoring allowed routes: Dashboard, Orders, Tracking, Settings
        expect(document.querySelector('a[href="/dashboard"]')).not.toBeNull();
        expect(document.querySelector('a[href="/orders"]')).not.toBeNull();
        expect(document.querySelector('a[href="/tracking"]')).not.toBeNull();
        expect(document.querySelector('a[href="/settings"]')).not.toBeNull();
      });

      // Monitoring disallowed routes should not be rendered
      expect(document.querySelector('a[href="/production"]')).toBeNull();
      expect(document.querySelector('a[href="/qc"]')).toBeNull();
      expect(document.querySelector('a[href="/dispatch"]')).toBeNull();
      expect(document.querySelector('a[href="/delivery"]')).toBeNull();
    });

    it("should redirect and filter links for tim_produksi role", async () => {
      // Set role to tim_produksi
      mockUserProfileData = {
        email: "produksi@alumana.id",
        displayName: "Production User",
        role: "tim_produksi",
      };
      mockCurrentUser = {
        email: "produksi@alumana.id",
        uid: "test-uid-123",
        displayName: "Production User",
      };

      // Go directly to production page
      window.history.pushState({}, "", "/production");
      render(<AppRouter />);

      // Verify that the production page title is loaded
      await waitFor(() => {
        expect(screen.getByRole("heading", { level: 1, name: "Production" })).toBeDefined();
      });

      // Verify only allowed navigation links are visible
      expect(document.querySelector('a[href="/production"]')).not.toBeNull();
      expect(document.querySelector('a[href="/settings"]')).not.toBeNull();

      // Verify other navigation links are hidden
      expect(document.querySelector('a[href="/dashboard"]')).toBeNull();
      expect(document.querySelector('a[href="/orders"]')).toBeNull();
      expect(document.querySelector('a[href="/qc"]')).toBeNull();
      expect(document.querySelector('a[href="/dispatch"]')).toBeNull();
      expect(document.querySelector('a[href="/delivery"]')).toBeNull();
      expect(document.querySelector('a[href="/tracking"]')).toBeNull();
    });

    it("should allow admin role to access all pages and see all links", async () => {
      mockUserProfileData = {
        email: "admin@alumana.id",
        displayName: "Admin User",
        role: "admin",
      };
      mockCurrentUser = {
        email: "admin@alumana.id",
        uid: "test-uid-123",
        displayName: "Admin User",
      };

      render(<AppRouter />);

      await waitFor(() => {
        // Admin sees all links
        expect(document.querySelector('a[href="/dashboard"]')).not.toBeNull();
        expect(document.querySelector('a[href="/orders"]')).not.toBeNull();
        expect(document.querySelector('a[href="/production"]')).not.toBeNull();
        expect(document.querySelector('a[href="/qc"]')).not.toBeNull();
        expect(document.querySelector('a[href="/dispatch"]')).not.toBeNull();
        expect(document.querySelector('a[href="/delivery"]')).not.toBeNull();
        expect(document.querySelector('a[href="/tracking"]')).not.toBeNull();
        expect(document.querySelector('a[href="/settings"]')).not.toBeNull();
      });
    });
  });
});
