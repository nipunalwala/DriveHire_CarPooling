export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = 'REQUEST_FAILED',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Browser credentials remain in memory; HttpOnly cookies are owned by the API. */
export class ApiClient {
  private token: string | null = null;
  private refreshHandler: (() => Promise<boolean>) | undefined;
  setAccessToken(token: string | null) {
    this.token = token;
  }
  setRefreshHandler(handler: () => Promise<boolean>) {
    this.refreshHandler = handler;
  }

  async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
      throw new ApiError('Only application API paths are allowed.');
    }
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body && !(init.body instanceof FormData))
      headers.set('Content-Type', 'application/json');
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    let response: Response;
    try {
      response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: 'same-origin' });
    } catch {
      throw new ApiError('Check your connection and try again. Your changes have not been saved.');
    }
    if (response.status === 401 && !path.startsWith('/auth/') && retry && this.refreshHandler) {
      if (await this.refreshHandler()) return this.request<T>(path, init, false);
    }
    const envelope = (await response.json().catch(() => null)) as {
      success?: boolean;
      data?: T;
      error?: { message?: string; code?: string };
    } | null;
    if (!response.ok || envelope?.success !== true) {
      throw new ApiError(
        envelope?.error?.message ?? 'We could not complete that request. Please try again.',
        response.status,
        envelope?.error?.code,
      );
    }
    return envelope.data as T;
  }
}

export const api = new ApiClient();
