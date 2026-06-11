import { useEffect } from "react";
import { AppRouter } from "@/router/AppRouter";
import { ToastProvider } from "@/contexts/ToastContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { syncSecureTime } from "@/services/secureTimeService";

function App() {
  useEffect(() => {
    // Proactively sync secure network time on app start
    void syncSecureTime();
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
