import { ROLE_DEFAULT_REDIRECT } from "@/constants/roles";

export interface RootTargetInput {
  /** App opened as the installed PWA (see isStandalone in pushService). */
  standalone: boolean;
  /** KASMA JOB profile role, or null without a KASMA JOB session. */
  kasmaRole: string | null;
  absensiSignedIn: boolean;
}

/**
 * Where `/` sends the visitor; null means the storefront homepage. A plain browser keeps the
 * old behavior. The installed PWA opens the /masuk door unless exactly one session exists.
 */
export function rootTarget({ standalone, kasmaRole, absensiSignedIn }: RootTargetInput): string | null {
  const kasmaRedirect = kasmaRole ? ROLE_DEFAULT_REDIRECT[kasmaRole] : undefined;
  const kasmaTarget = kasmaRedirect && kasmaRedirect !== "/" ? kasmaRedirect : null;
  if (!standalone) return kasmaTarget;

  const kasmaSignedIn = kasmaRole !== null;
  if (kasmaSignedIn && absensiSignedIn) return "/masuk";
  if (absensiSignedIn) return "/absensi";
  if (kasmaSignedIn) return kasmaTarget;
  return "/masuk";
}
