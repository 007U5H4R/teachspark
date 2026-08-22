import { Route, Routes, useLocation } from 'react-router';
import { Nav } from './components/Nav.tsx';
import { showSignupCta } from './lib/nav.ts';
import { Landing } from './pages/Landing.tsx';

export function App() {
  const { pathname } = useLocation();
  return (
    <div className="shell">
      <Nav showSignup={showSignupCta(pathname)} />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </div>
  );
}
