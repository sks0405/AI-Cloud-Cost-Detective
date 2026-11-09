/**
 * API client for AI Cloud Cost Detective backend.
 * Handles JWT token storage, automatic Bearer headers, and endpoint calls.
 */

const API_BASE = '/api';

export interface User {
  id: number | string;
  email: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface CostIssue {
  resource_name: string;
  resource_type: string;
  issue_type: string;
  severity: 'high' | 'medium' | 'low';
  explanation: string;
  recommendation: string;
  fix_command: string;
}

export interface ResourceItem {
  resource_type: string;
  type: string;
  name: string;
  location: string;
  sku: string;
  tags: Record<string, string>;
  arn: string;
}

export interface AnalysisReport {
  id?: number;
  analysis_id?: string;
  resource_group: string;
  total_resources: number;
  resources: ResourceItem[];
  summary: string;
  estimated_savings: string;
  issues: CostIssue[];
  actionable_fix_commands: string[];
  created_at?: string;
}

export interface HistoryItem {
  id: number;
  user_id?: number | null;
  resource_group: string;
  resources_scanned: number;
  issues_found: number;
  estimated_savings: string;
  analysis_result: AnalysisReport;
  status: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Auth Storage Helpers
// ---------------------------------------------------------------------------

export const getToken = (): string | null => {
  return localStorage.getItem('token');
};

export const getUser = (): User | null => {
  const userJson = localStorage.getItem('user');
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
};

export const setAuthSession = (token: string, user: User) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
};

export const clearAuthSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

export const isAuthenticated = (): boolean => {
  return !!getToken();
};

// ---------------------------------------------------------------------------
// HTTP Request Helper
// ---------------------------------------------------------------------------

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAuthSession();
    // Dispatch custom event to notify App
    window.dispatchEvent(new Event('auth_change'));
    throw new Error('Session expired or unauthorized. Please log in.');
  }

  if (!response.ok) {
    let errorDetail = 'Request failed';
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await response.text();
    }
    throw new Error(errorDetail || `HTTP error ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API Methods
// ---------------------------------------------------------------------------

export const api = {
  // Auth
  signup: async (email: string, password: string): Promise<AuthResponse> => {
    const res = await request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthSession(res.access_token, res.user);
    window.dispatchEvent(new Event('auth_change'));
    return res;
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const res = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthSession(res.access_token, res.user);
    window.dispatchEvent(new Event('auth_change'));
    return res;
  },

  logout: () => {
    clearAuthSession();
    window.dispatchEvent(new Event('auth_change'));
  },

  // Resource Groups
  getResourceGroups: async (): Promise<string[]> => {
    const res = await request<{ resource_groups: string[] }>('/resource-groups');
    return res.resource_groups || [];
  },

  // Analyze
  runAnalysis: async (resourceGroup: string, analysisId?: string): Promise<AnalysisReport> => {
    return request<AnalysisReport>('/analyze', {
      method: 'POST',
      body: JSON.stringify({
        resource_group: resourceGroup,
        analysis_id: analysisId,
      }),
    });
  },

  // History
  getHistory: async (): Promise<HistoryItem[]> => {
    return request<HistoryItem[]>('/history');
  },
};
