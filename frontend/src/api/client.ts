/**
 * API client — all calls go through here.
 * Automatically attaches JWT Bearer token from localStorage.
 * Throws with real server error messages.
 */

const BASE_URL = '/api';

function getToken(): string | null {
  return localStorage.getItem('mycloud_token');
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({ success: false, error: res.statusText }));

  if (!json.success) {
    throw new Error(json.error ?? `Request failed: ${res.status}`);
  }

  return json.data as T;
}

async function upload<T>(path: string, file: File, onProgress?: (percent: number) => void): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const form = new FormData();
  form.append('file', file);

  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    const token = getToken();
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error('No se pudo conectar con el servidor.'));
    request.onload = () => {
      let json: { success?: boolean; data?: T; error?: string };
      try {
        json = JSON.parse(request.responseText);
      } catch {
        reject(new Error(request.statusText || 'Respuesta inválida del servidor.'));
        return;
      }
      if (request.status < 200 || request.status >= 300 || !json.success) {
        reject(new Error(json.error ?? `Upload failed: ${request.status}`));
        return;
      }
      onProgress?.(100);
      resolve(json.data as T);
    };
    request.send(form);
  });
}

export const api = {
  get:    <T>(path: string) => request<T>('GET', path),
  post:   <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch:  <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, file: File, onProgress?: (percent: number) => void) => upload<T>(path, file, onProgress),
};
