// ============================================================================
// MBG Production Service — Nutrition + Cooking + PDF
// ============================================================================

import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MbgNutritionEntry, MbgCookingSession, MbgCookingPhoto } from '@/types/mbg';

const NUTRITION_COLLECTION = 'mbg_nutrition';
const COOKING_COLLECTION = 'mbg_cooking_sessions';

// ---- Nutrition ----

export function subscribeNutrition(
  batchId: string,
  callback: (entries: MbgNutritionEntry[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, NUTRITION_COLLECTION),
    where('batchId', '==', batchId)
  );
  return onSnapshot(q, (snap) => {
    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgNutritionEntry));
    entries.sort((a, b) => (a.menuItemName || '').localeCompare(b.menuItemName || ''));
    callback(entries);
  }, onError);
}

export async function addNutritionEntry(entry: Omit<MbgNutritionEntry, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, NUTRITION_COLLECTION), entry);
  return ref.id;
}

export async function updateNutritionEntry(id: string, updates: Partial<MbgNutritionEntry>): Promise<void> {
  await updateDoc(doc(db, NUTRITION_COLLECTION, id), updates);
}

export async function deleteNutritionEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, NUTRITION_COLLECTION, id));
}

// ---- Cooking Sessions ----

export function subscribeCookingSessions(
  batchId: string,
  callback: (sessions: MbgCookingSession[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, COOKING_COLLECTION),
    where('batchId', '==', batchId)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgCookingSession)));
  }, onError);
}

export async function createCookingSession(
  batchId: string,
  cookedBy: string
): Promise<string> {
  const session: Omit<MbgCookingSession, 'id'> = {
    batchId,
    status: 'preparation',
    photos: [],
    startedAt: new Date().toISOString(),
    completedAt: '',
    cookedBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, COOKING_COLLECTION), session);
  return ref.id;
}

export async function updateCookingSession(
  id: string,
  updates: Partial<MbgCookingSession>
): Promise<void> {
  await updateDoc(doc(db, COOKING_COLLECTION, id), {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function addCookingPhoto(
  sessionId: string,
  currentPhotos: MbgCookingPhoto[],
  newPhoto: MbgCookingPhoto
): Promise<void> {
  await updateDoc(doc(db, COOKING_COLLECTION, sessionId), {
    photos: [...currentPhotos, newPhoto],
    updatedAt: new Date().toISOString(),
  });
}

// ---- Custom TKPI Entries ----

const CUSTOM_TKPI_COLLECTION = 'mbg_custom_tkpi';

export async function addCustomTkpiEntry(entry: Record<string, unknown>): Promise<string> {
  const ref = await addDoc(collection(db, CUSTOM_TKPI_COLLECTION), entry);
  return ref.id;
}

export async function updateCustomTkpiEntry(id: string, updates: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db, CUSTOM_TKPI_COLLECTION, id), updates);
}

export async function deleteCustomTkpiEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, CUSTOM_TKPI_COLLECTION, id));
}

export function subscribeCustomTkpiEntries(
  callback: (entries: Record<string, unknown>[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(collection(db, CUSTOM_TKPI_COLLECTION));
  return onSnapshot(q, (snap) => {
    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Record<string, unknown>);
    callback(entries);
  }, onError);
}

// ---- Custom Recipes ----
const CUSTOM_RECIPES_COLLECTION = 'mbg_custom_recipes';

export async function addCustomRecipe(recipe: Record<string, unknown>): Promise<string> {
  const ref = await addDoc(collection(db, CUSTOM_RECIPES_COLLECTION), recipe);
  return ref.id;
}

export async function updateCustomRecipe(id: string, updates: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db, CUSTOM_RECIPES_COLLECTION, id), updates);
}

export async function deleteCustomRecipe(id: string): Promise<void> {
  await deleteDoc(doc(db, CUSTOM_RECIPES_COLLECTION, id));
}

export function subscribeCustomRecipes(
  callback: (recipes: Record<string, unknown>[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(collection(db, CUSTOM_RECIPES_COLLECTION));
  return onSnapshot(q, (snap) => {
    const recipes = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Record<string, unknown>);
    callback(recipes);
  }, onError);
}

// ---- Recipe Adjustments ----
const RECIPE_ADJUSTMENTS_COLLECTION = 'mbg_recipe_adjustments';

export function subscribeRecipeAdjustments(
  batchId: string,
  callback: (adjustments: Record<string, any>[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, RECIPE_ADJUSTMENTS_COLLECTION),
    where('batchId', '==', batchId)
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(list);
  }, onError);
}

export async function saveRecipeAdjustment(
  adjustmentId: string | null,
  adjustment: Record<string, any>
): Promise<string> {
  if (adjustmentId) {
    await updateDoc(doc(db, RECIPE_ADJUSTMENTS_COLLECTION, adjustmentId), {
      ...adjustment,
      updatedAt: new Date().toISOString()
    });
    return adjustmentId;
  } else {
    const ref = await addDoc(collection(db, RECIPE_ADJUSTMENTS_COLLECTION), {
      ...adjustment,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return ref.id;
  }
}

export async function deleteRecipeAdjustment(id: string): Promise<void> {
  await deleteDoc(doc(db, RECIPE_ADJUSTMENTS_COLLECTION, id));
}
