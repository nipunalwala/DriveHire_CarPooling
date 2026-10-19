import { PageMetaSchema, type Page } from '@drivehire/contracts';

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

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return (await this.envelope<T>(path, init)).data as T;
  }

  async requestPage<T>(path: string, init: RequestInit = {}): Promise<Page<T>> {
    const result = await this.envelope<T[]>(path, init);
    const meta = PageMetaSchema.safeParse(result.meta);
    if (!Array.isArray(result.data) || !meta.success) {
      throw new ApiError('The list response was incomplete. Please reload and try again.');
    }
    return { success: true, data: result.data, meta: meta.data };
  }

  async documentContent(id: string, retry = true): Promise<Blob> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new ApiError('Invalid document reference.');
    }
    const headers = new Headers();
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    let response: Response;
    try {
      response = await fetch(`/api/v1/documents/${id}/content`, {
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } catch {
      throw new ApiError('Could not load private evidence. Check your connection and try again.');
    }
    if (response.status === 401 && retry && this.refreshHandler && (await this.refreshHandler())) {
      return this.documentContent(id, false);
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string; code?: string };
      } | null;
      throw new ApiError(
        body?.error?.message ?? 'Private evidence is unavailable or access was denied.',
        response.status,
        body?.error?.code,
      );
    }
    return response.blob();
  }
  private async envelope<T>(
    path: string,
    init: RequestInit = {},
    retry = true,
  ): Promise<{ data?: T; meta?: unknown }> {
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
      if (await this.refreshHandler()) return this.envelope<T>(path, init, false);
    }
    const envelope = (await response.json().catch(() => null)) as {
      success?: boolean;
      data?: T;
      meta?: unknown;
      error?: { message?: string; code?: string };
    } | null;
    if (!response.ok || envelope?.success !== true) {
      throw new ApiError(
        envelope?.error?.message ?? 'We could not complete that request. Please try again.',
        response.status,
        envelope?.error?.code,
      );
    }
    return envelope;
  }
}

export const api = new ApiClient();
