import { AppRouter } from "@/router/AppRouter";
import { ToastProvider } from "@/contexts/ToastContext";
import { LanguageProvider } from "@/contexts/LanguageContext";

function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </LanguageProvider>
  );
}

export default App;
