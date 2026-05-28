export const CATEGORY_TRANSLATIONS: Record<string, Record<string, string>> = {
  id: {
    "Sembako": "Sembako",
    "Minuman": "Minuman",
    "Kebersihan": "Kebersihan",
    "Makanan": "Makanan",
    "Bumbu & Rempah": "Bumbu & Rempah",
  },
  en: {
    "Sembako": "Groceries",
    "Minuman": "Drinks",
    "Kebersihan": "Cleaning",
    "Makanan": "Food",
    "Bumbu & Rempah": "Spices & Seasonings",
  },
};

export function translateCategory(category: string, lang: string): string {
  if (!category) return "";
  const trimmed = category.trim();
  return CATEGORY_TRANSLATIONS[lang]?.[trimmed] || trimmed;
}
