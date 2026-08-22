import { Route, Routes } from 'react-router';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<h1>TeachSpark</h1>} />
      <Route path="*" element={<h1>TeachSpark</h1>} />
    </Routes>
  );
}
