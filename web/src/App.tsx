import { Route, Routes, useLocation } from 'react-router';
import { Nav } from './components/Nav.tsx';
import { showSignupCta } from './lib/nav.ts';

export function App() {
  const { pathname } = useLocation();
  return (
    <div className="shell">
      <Nav showSignup={showSignupCta(pathname)} />
      <Routes>
        <Route path="/" element={<h1>TeachSpark</h1>} />
        <Route path="*" element={<h1>TeachSpark</h1>} />
      </Routes>
    </div>
  );
}
