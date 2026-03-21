const API_BASE = import.meta.env.PUBLIC_API_URL ?? 'http://backend:3000/api';

export async function fetchApi<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
