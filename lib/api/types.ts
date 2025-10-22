export interface ApiRequest<B = unknown> {
  method?: string;
  body?: B;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string | string[]>;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

export type ApiHandler<B = unknown> = (
  req: ApiRequest<B>,
  res: ApiResponse
) => void | Promise<void>;
