export interface IngredientItem {
  name: string;
  amount: number;
  unit: string;
}

/**
 * Parses raw manual input of ingredients like:
 * "Nasi: 500 gram\nAyam 100gr\nBawang Merah 3 butir"
 * Into structured IngredientItems.
 */
export function parseIngredients(text: string): IngredientItem[] {
  if (!text) return [];
  const lines = text.split(/[\n,;]+/);
  const items: IngredientItem[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Find first number in line (supports decimals like 1.5 or 0.5)
    const numMatch = line.match(/(\d+(?:[.,]\d+)?)/);
    if (!numMatch) {
      // No amount specified, treat as qualitative (amount 0)
      items.push({
        name: line.replace(/[:-]/g, "").trim(),
        amount: 0,
        unit: "",
      });
      continue;
    }

    const amountStr = numMatch[1].replace(",", ".");
    const amount = parseFloat(amountStr);

    const index = line.indexOf(numMatch[1]);
    const before = line.substring(0, index).trim();
    const after = line.substring(index + numMatch[1].length).trim();

    // Determine unit
    let unit = "";
    let name = "";

    const unitRegex = /^(gram|gr|g|kg|ml|l|liter|butir|pcs|btr|sdm|sdt|bungkus|pack|lembar|porsi)/i;
    const unitMatch = after.match(unitRegex);

    if (unitMatch) {
      unit = unitMatch[1];
      name = (before + " " + after.substring(unitMatch[0].length)).trim();
    } else {
      const afterWords = after.split(/\s+/);
      const firstWord = afterWords[0];
      if (firstWord && /^(gram|gr|g|kg|ml|l|liter|butir|pcs|btr|sdm|sdt|bungkus|pack|lembar|porsi)$/i.test(firstWord)) {
        unit = firstWord;
        name = (before + " " + afterWords.slice(1).join(" ")).trim();
      } else {
        name = (before + " " + after).trim();
      }
    }

    name = name.replace(/^[:\-\s]+|[:\-\s]+$/g, "").trim();

    items.push({
      name: name || "Bahan",
      amount,
      unit: unit || "pcs",
    });
  }

  return items;
}

/**
 * Aggregates all ingredients in the order list, scaling each item's ingredient
 * by its quantity, and grouping same name+unit ingredients together.
 */
export function aggregateIngredients(items: { ingredients?: string; quantity: number }[]): IngredientItem[] {
  const map: Record<string, { name: string; amount: number; unit: string }> = {};

  for (const item of items) {
    if (!item.ingredients) continue;
    const parsed = parseIngredients(item.ingredients);
    for (const ing of parsed) {
      const nameKey = ing.name.toLowerCase().trim();
      const unitKey = ing.unit.toLowerCase().trim();
      const key = `${nameKey}_${unitKey}`;

      if (map[key]) {
        map[key].amount += ing.amount * item.quantity;
      } else {
        map[key] = {
          name: ing.name,
          amount: ing.amount * item.quantity,
          unit: ing.unit,
        };
      }
    }
  }

  return Object.values(map);
}
