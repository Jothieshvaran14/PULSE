export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiError;
  meta: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

export interface ApiMeta {
  timestamp: string;
  requestId?: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}
