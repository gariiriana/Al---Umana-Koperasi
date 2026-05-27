import { AppRouter } from "@/router/AppRouter";
import { ToastProvider } from "@/contexts/ToastContext";

function App() {
  return (
    <ToastProvider>
      <AppRouter />
    </ToastProvider>
  );
}

export default App;
