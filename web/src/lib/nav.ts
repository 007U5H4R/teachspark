/** The persistent sign-up CTA appears wherever a teacher has not yet signed up. */
export function showSignupCta(pathname: string): boolean {
  if (pathname === '/join' || pathname === '/joined') return false;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return false;
  return true;
}
