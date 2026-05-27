import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Language = "id" | "en";

export interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem("al-umana-lang");
    return saved === "en" ? "en" : "id";
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem("al-umana-lang", newLang);
    // Fire a custom event to notify components in the same window instantly
    window.dispatchEvent(new Event("al-umana-languagechange"));
  };

  useEffect(() => {
    const syncLang = () => {
      const saved = localStorage.getItem("al-umana-lang");
      const current = saved === "en" ? "en" : "id";
      if (current !== lang) {
        setLangState(current);
      }
    };

    window.addEventListener("storage", syncLang);
    window.addEventListener("al-umana-languagechange", syncLang);

    return () => {
      window.removeEventListener("storage", syncLang);
      window.removeEventListener("al-umana-languagechange", syncLang);
    };
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
