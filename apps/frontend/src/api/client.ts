import axios from "axios";

const API_BASE = "/api/v1";

/** Single source of truth for the session token storage key (C2: pulse_auth_token). */
export const AUTH_TOKEN_KEY = "pulse_auth_token";

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// Request interceptor — attach auth token from sessionStorage
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: {
    timestamp: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: any;
  };
}

// Response interceptor to extract data
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If we get a 401, clear the stored token
    if (error.response?.status === 401) {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      // Redirect to login if not already there
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }

    if (error.response?.data?.error) {
      return Promise.reject(error.response.data.error);
    }
    return Promise.reject(error);
  }
);
