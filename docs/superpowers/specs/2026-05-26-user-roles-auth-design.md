# Spec: Firebase Auth & User Roles Integration

## Overview

This specification outlines the changes required to implement role-based access control and enhance authentication capabilities in the Al-Umana Order Fulfillment & Delivery Tracking System.

Specifically, we are adding:

1. **Customer Registration**: Allowing customers (`pelanggan`) to sign up from the application.
2. **Role Management**: Syncing user profiles dynamically from Firestore `/users/{userId}` to support internal roles: `tim_produksi`, `distribusi`, `monitoring`, `admin`, and `pelanggan`.
3. **Security Rules**: Updating Firestore security rules to protect user profile data and prevent role escalation.
4. **Forgot Password**: A dedicated page for sending password reset emails.
5. **Show/Hide Password**: Password visibility toggles on Login and Register forms.

---

## 1. Data Model & Firestore Rules

### Collection: `users`

* Path: `/users/{userId}` (where `userId` matches the Firebase Auth UID)
* Document Structure:

  ```typescript
  interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    role: 'tim_produksi' | 'distribusi' | 'monitoring' | 'admin' | 'pelanggan';
    createdAt: Date;
  }
  ```

### Firestore Security Rules

We will update `firestore.rules` to include permissions for the `users` collection:

```javascript
// Helper for admin role checking
function isAdmin() {
  return request.auth != null && 
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}

match /users/{userId} {
  // Allow all authenticated users to read profiles (needed to display names/roles)
  allow read: if request.auth != null;

  // Allow users to create their own profile, but force role to 'pelanggan'
  allow create: if request.auth != null 
    && request.auth.uid == userId 
    && request.resource.data.role == 'pelanggan';

  // Allow users to update their own profile, but do not allow modifying the 'role' field
  allow update: if request.auth != null 
    && request.auth.uid == userId 
    && request.resource.data.role == resource.data.role;

  // Admins have full access
  allow write: if isAdmin();
}
```

---

## 2. Authentication Services & Context Updates

### `authService.ts`

We will add two new functions:

* `signUp(email, password, displayName)`: Signs up a user in Firebase Auth and creates their profile document in Firestore.
* `sendPasswordReset(email)`: Sends a password reset email.

### `AuthContext.tsx`

We will update `AuthContextValue` to include the user profile and new authentication methods:

```typescript
export interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null; // Real-time synced Firestore profile
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}
```

* **Profile Syncing**: When `onAuthStateChanged` triggers with a logged-in user, we will attach an `onSnapshot` listener to `/users/{user.uid}`. If the document doesn't exist (e.g. for pre-existing internal users not yet created in Firestore), we can fallback safely or wait until it's created. Once the profile snapshot is fetched, we will update the profile state.

---

## 3. UI Enhancements & Pages

### Password Field Show/Hide Toggle

We will modify `@/components/ui/Input.tsx` to ensure `rightIcon` does not block click events (remove `pointer-events-none` from its wrapper) so that we can pass clickable toggle buttons (e.g. eye/eye-off icons) for password visibility.

### Login Page (`LoginPage.tsx`)

* Add a visibility toggle to the password input field.
* Add a "Forgot Password?" link below the password input that redirects to `/forgot-password`.
* Add a "Don't have an account? Register" link redirecting to `/register`.

### Register Page (`RegisterPage.tsx`) [NEW]

* Form fields: Full Name, Email, Password, Confirm Password.
* Show/hide toggle on both password fields.
* On submission: calls `signUp()`, then redirects to `/dashboard`.
* Link to LoginPage.

### Forgot Password Page (`ForgotPasswordPage.tsx`) [NEW]

* Form fields: Email.
* Calls `sendPasswordReset()`, shows success alert, and provides a link to return to the login page.

---

## 4. Routing Changes (`AppRouter.tsx`)

* Add public routes:
  * `/register` -> `<RegisterPage />`
  * `/forgot-password` -> `<ForgotPasswordPage />`
* Make sure logged-in users are redirected away from public auth routes if they try to access them.
