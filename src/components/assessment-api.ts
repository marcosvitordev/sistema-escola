export class AssessmentError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function assessmentRequest<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch(`/api/assessments/${path}`, { method, cache: 'no-store', ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body), headers: form ? undefined : { 'Content-Type': 'application/json' } }) });
  const data = await response.json();
  if (!response.ok) throw new AssessmentError(data.error || 'Não foi possível concluir a operação.', response.status);
  return data as T;
}
