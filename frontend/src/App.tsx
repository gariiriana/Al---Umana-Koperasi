import { useEffect } from "react";
import { AppRouter } from "@/router/AppRouter";
import { ToastProvider } from "@/contexts/ToastContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { syncSecureTime } from "@/services/secureTimeService";

function App() {
  useEffect(() => {
    // Proactively sync secure network time on app start
    void syncSecureTime();

    // Auto-reload on Vite dynamic import failure caused by new deployments
    const handleChunkError = (event: PromiseRejectionEvent | ErrorEvent) => {
      const error = 'reason' in event ? (event as PromiseRejectionEvent).reason : (event as ErrorEvent).error;
      const message =
        error?.message ||
        (typeof event === 'object' && 'message' in event ? (event as ErrorEvent).message : '') ||
        '';

      if (
        message &&
        (message.includes('Failed to fetch dynamically imported module') ||
          message.includes('Importing a module script failed') ||
          message.includes('error loading dynamically imported module'))
      ) {
        const reloadedKey = 'chunk_reload_' + window.location.pathname;
        if (!sessionStorage.getItem(reloadedKey)) {
          sessionStorage.setItem(reloadedKey, 'true');
          window.location.reload();
        }
      }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleChunkError);

    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleChunkError);
    };
  }, []);

  return (
    <LanguageProvider>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </LanguageProvider>
  );
}

export default App;
