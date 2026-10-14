import axios, { type InternalAxiosRequestConfig } from 'axios';

let accessToken: string | undefined;
export function setAccessToken(token?: string): void {
  accessToken = token;
}
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  withCredentials: true,
  timeout: 15_000
});
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});
let refreshInFlight: Promise<string | undefined> | undefined;
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config &&
      !error.config.headers['x-refresh-retry']
    ) {
      refreshInFlight ??= axios
        .post(`${api.defaults.baseURL}/auth/refresh`, {}, { withCredentials: true })
        .then((result) => result.data.data.accessToken as string)
        .catch(() => undefined)
        .finally(() => {
          refreshInFlight = undefined;
        });
      const token = await refreshInFlight;
      if (token) {
        setAccessToken(token);
        error.config.headers['x-refresh-retry'] = '1';
        error.config.headers.Authorization = `Bearer ${token}`;
        return api.request(error.config);
      }
    }
    return Promise.reject(error);
  }
);
