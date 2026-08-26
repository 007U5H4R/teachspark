import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { Nav } from './components/Nav.tsx';
import { Footer } from './components/Footer.tsx';
import { showSignupCta } from './lib/nav.ts';
import { useScrollOnNavigation } from './lib/scrollOnNavigation.ts';
import { trackAnalytics } from './lib/analytics.ts';
import { getVariant } from './lib/variant.ts';
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
  // A/B test at "/": a sticky per-browser bucket shows either the original Landing (A) or the /v2
  // redesign (B). The variant rides every Mixpanel event as a super-property (see analytics.ts), so
  // the funnel is comparable A-vs-B. `/v2` still always serves B for a direct preview.
  const [variant] = useState(getVariant);
  const showV2AtRoot = pathname === '/' && variant === 'B';
  // Both the /v2 route and the B-variant-at-"/" render LandingV2, which ships its own light nav +
  // footer, so the global (dark) chrome is suppressed for them. Variant A renders exactly as before.
  const chromeless = pathname === '/v2' || showV2AtRoot;
  return (
    <div className={`shell${chromeless ? ' shell--bare' : ''}`}>
      {!chromeless && <Nav showSignup={showSignupCta(pathname)} />}
      <Routes>
        <Route path="/" element={showV2AtRoot ? <LandingV2 /> : <Landing />} />
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
