import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';

function MainApp() {
  const [init, setInit] = useState(false);

  useEffect(() => {
    // Ініціалізація рушія один раз на весь додаток
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  // Чекаємо ініціалізації частинок, перш ніж рендерити додаток,
  // щоб всі ефекти малювалися відразу
  if (!init) return null;

  return (
    <GoogleOAuthProvider clientId="1061146381013-4fbei2huplouqof6c5hqg7pn7a9tdvn1.apps.googleusercontent.com">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MainApp />
  </StrictMode>
);
