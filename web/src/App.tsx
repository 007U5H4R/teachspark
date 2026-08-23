import { Route, Routes, useLocation } from 'react-router';
import { Nav } from './components/Nav.tsx';
import { Footer } from './components/Footer.tsx';
import { showSignupCta } from './lib/nav.ts';
import { useScrollOnNavigation } from './lib/scrollOnNavigation.ts';
import { Admin } from './pages/Admin.tsx';
import { Demo } from './pages/Demo.tsx';
import { Join } from './pages/Join.tsx';
import { Joined } from './pages/Joined.tsx';
import { Landing } from './pages/Landing.tsx';

export function App() {
  const { pathname } = useLocation();
  useScrollOnNavigation();
  return (
    <div className="shell">
      <Nav showSignup={showSignupCta(pathname)} />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/join" element={<Join />} />
        <Route path="/joined" element={<Joined />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Landing />} />
      </Routes>
      <Footer />
    </div>
  );
}
