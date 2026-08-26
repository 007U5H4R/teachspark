import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { Nav } from './components/Nav.tsx';
import { Footer } from './components/Footer.tsx';
import { showSignupCta } from './lib/nav.ts';
import { useScrollOnNavigation } from './lib/scrollOnNavigation.ts';
import { trackAnalytics } from './lib/analytics.ts';
import { Admin } from './pages/Admin.tsx';
import { Join } from './pages/Join.tsx';
import { Joined } from './pages/Joined.tsx';
import { Landing } from './pages/Landing.tsx';
import { LandingV2 } from './pages/LandingV2.tsx';
import { SparkLab } from './pages/SparkLab.tsx';

export function App() {
  const { pathname } = useLocation();
  useScrollOnNavigation();
  // One page_view per SPA navigation (Mixpanel's own track_pageview is off — it misses route changes).
  useEffect(() => { trackAnalytics('page_view', { path: pathname }); }, [pathname]);
  // The /v2 alternate landing ships its own light nav + footer, so the global (dark) chrome is
  // suppressed there. Every other route — including the original "/" — renders exactly as before.
  const chromeless = pathname === '/v2';
  return (
    <div className="shell">
      {!chromeless && <Nav showSignup={showSignupCta(pathname)} />}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/v2" element={<LandingV2 />} />
        <Route path="/join" element={<Join />} />
        <Route path="/joined" element={<Joined />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/spark" element={<SparkLab />} />
        <Route path="*" element={<Landing />} />
      </Routes>
      {!chromeless && <Footer />}
    </div>
  );
}
