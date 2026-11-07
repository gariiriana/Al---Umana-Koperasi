// Firestore REST helpers. The web SDK cannot fetch only some fields of a document, but the
// REST `runQuery` endpoint can (`select`). Used where documents carry large base64 photos
// that the caller does not need. Security rules still apply: the request is sent with the
// signed-in user's Firebase ID token.

export interface RestValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  stringValue?: string;
  timestampValue?: string;
  arrayValue?: { values?: RestValue[] };
  mapValue?: { fields?: Record<string, RestValue> };
}

/** Converts a REST `Value` into the plain JS value the SDK would give (timestamps stay ISO strings). */
export function decodeRestValue(value: RestValue): unknown {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue?.values ?? []).map(decodeRestValue);
  if ('mapValue' in value) return decodeRestFields(value.mapValue?.fields);
  return undefined;
}

export function decodeRestFields(fields: Record<string, RestValue> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields ?? {})) out[key] = decodeRestValue(val);
  return out;
}

interface RunQueryRow {
  document?: { name: string; fields?: Record<string, RestValue> };
}

/**
 * Documents of `collectionId` whose `field` equals the string `value`, with only `selectFields`.
 * Returns `{ id, ...fields }` per document.
 */
export async function runEqualityQuerySelect(params: {
  projectId: string;
  idToken: string;
  collectionId: string;
  field: string;
  value: string;
  selectFields: readonly string[];
  fetchImpl?: typeof fetch;
}): Promise<Record<string, unknown>[]> {
  const { projectId, idToken, collectionId, field, value, selectFields } = params;
  const fetchImpl = params.fetchImpl ?? fetch;
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
        select: { fields: selectFields.map((fieldPath) => ({ fieldPath })) },
      },
    }),
  });
  if (!res.ok) throw new Error(`Firestore runQuery gagal (${res.status})`);
  const rows = (await res.json()) as RunQueryRow[];
  return rows
    .filter((row) => row.document)
    .map((row) => {
      const doc = row.document!;
      return { id: doc.name.slice(doc.name.lastIndexOf('/') + 1), ...decodeRestFields(doc.fields) };
    });
}
