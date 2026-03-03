export async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail ?? body.error ?? `HTTP ${res.status}`;
    throw new Error(Array.isArray(detail) ? detail[0]?.msg ?? String(detail) : String(detail));
  }
  return res.json();
}

export async function handleVoidResponse(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail ?? body.error ?? `HTTP ${res.status}`;
    throw new Error(String(detail));
  }
}
