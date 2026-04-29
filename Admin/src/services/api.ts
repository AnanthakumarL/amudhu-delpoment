import axios, { type AxiosInstance } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL environment variable is not defined');
}

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Type definitions
export interface SiteConfig {
  id?: string;
  [key: string]: any;
}

export interface Section {
  id?: string;
  name: string;
  [key: string]: any;
}

export interface Category {
  id?: string;
  name: string;
  section_id?: string;
  [key: string]: any;
}

export interface Product {
  id?: string;
  name: string;
  category_id?: string;
  [key: string]: any;
}

export interface Order {
  id?: string;
  order_number?: string;
  [key: string]: any;
}

export interface OrderStatistics {
  [key: string]: any;
}

export interface ProductionManagement {
  id?: string;
  name?: string;
  production_date?: string;
  status?: string;
  quantity?: number;
  product_id?: string;
  notes?: string;
  [key: string]: any;
}

export interface DeliveryManagement {
  id?: string;
  order_id?: string;
  tracking_number?: string;
  delivery_date?: string;
  status?: string;
  contact_name?: string;
  contact_phone?: string;
  address?: string;
  notes?: string;
  delivery_identifier?: string;
  delivery_assigned_at?: string;
  [key: string]: any;
}

export interface DeliveryUser {
  id?: string;
  name?: string;
  identifier?: string;
  phone?: string;
  login_id?: string;
  email?: string;
  is_production_account?: boolean;
  last_login?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface ProductionUser {
  id?: string;
  name: string;
  identifier: string;
  production_address: string;
  password?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface Account {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface Job {
  id?: string;
  title?: string;
  status?: string;
  scheduled_at?: string;
  started_at?: string;
  finished_at?: string;
  notes?: string;
  attributes?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface Application {
  id?: string;
  job_id?: string | null;
  job_title?: string | null;
  applicant_name?: string;
  applicant_email?: string | null;
  applicant_phone?: string | null;
  message?: string | null;
  resume_url?: string | null;
  status?: string;
  attributes?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface AuthUser {
  id: string;
  name: string;
  identifier: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginPayload {
  identifier: string;
  password: string;
}

export interface ListParams {
  page?: number;
  page_size?: number;
  limit?: number;
  [key: string]: any;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  data: T[];
}

// Auth API
export const authAPI = {
  login: (data: LoginPayload) => api.post<AuthUser>('/auth/login', data),
};

// Users API (Auth users)
export const usersAPI = {
  list: (params?: ListParams & { is_active?: boolean; production_only?: boolean }) =>
    api.get<PaginatedResponse<AuthUser>>('/users', { params }),
};

export const productionUsersAPI = {
  list: (params?: ListParams & { is_active?: boolean }) =>
    api.get<PaginatedResponse<ProductionUser>>('/production-users', { params }),
  create: (data: Partial<ProductionUser>) => api.post<ProductionUser>('/production-users', data),
  get: (id: string) => api.get<ProductionUser>(`/production-users/${id}`),
  update: (id: string, data: Partial<ProductionUser>) => api.put<ProductionUser>(`/production-users/${id}`, data),
  delete: (id: string) => api.delete(`/production-users/${id}`),
};

export const deliveryUsersAPI = {
  list: (params?: ListParams & { is_active?: boolean }) =>
    api.get<PaginatedResponse<DeliveryUser>>('/delivery-users', { params }),
  create: (data: Partial<DeliveryUser>) => api.post<DeliveryUser>('/delivery-users', data),
  get: (id: string) => api.get<DeliveryUser>(`/delivery-users/${id}`),
  update: (id: string, data: Partial<DeliveryUser>) => api.put<DeliveryUser>(`/delivery-users/${id}`, data),
  delete: (id: string) => api.delete(`/delivery-users/${id}`),
};

// Site Configuration API
export const siteConfigAPI = {
  get: () => api.get<SiteConfig>('/site-config'),
  update: (data: Partial<SiteConfig>) => api.put<SiteConfig>('/site-config', data),
};

// Sections API
export const sectionsAPI = {
  list: (params?: ListParams) => api.get<PaginatedResponse<Section>>('/sections', { params }),
  get: (id: string) => api.get<Section>(`/sections/${id}`),
  create: (data: Partial<Section>) => api.post<Section>('/sections', data),
  update: (id: string, data: Partial<Section>) => api.put<Section>(`/sections/${id}`, data),
  delete: (id: string) => api.delete(`/sections/${id}`),
};

// Categories API
export const categoriesAPI = {
  list: (params?: ListParams) => api.get<PaginatedResponse<Category>>('/categories', { params }),
  get: (id: string) => api.get<Category>(`/categories/${id}`),
  create: (data: Partial<Category>) => api.post<Category>('/categories', data),
  update: (id: string, data: Partial<Category>) => api.put<Category>(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
};

// Products API
export const productsAPI = {
  list: (params?: ListParams) => api.get<PaginatedResponse<Product>>('/products', { params }),
  get: (id: string) => api.get<Product>(`/products/${id}`),
  create: (data: Partial<Product>) => api.post<Product>('/products', data),
  createWithImage: (data: Partial<Product>, imageFile: File) => {
    const formData = new FormData();

    // Only append defined fields (avoids FastAPI issues with empty strings)
    Object.entries(data || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (value === '') return;
      formData.append(key, String(value));
    });

    formData.append('image', imageFile);

    return api.post<Product>('/products/with-image', formData, {
      headers: {
        // Override the default JSON content-type
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  update: (id: string, data: Partial<Product>) => api.put<Product>(`/products/${id}`, data),
  uploadImage: (id: string, imageFile: File) => {
    const formData = new FormData();
    formData.append('image', imageFile);

    return api.post<Product>(`/products/${id}/image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  delete: (id: string) => api.delete(`/products/${id}`),
  search: (query: string) => api.get<Product[]>('/products/search', { params: { q: query } }),
};

// Orders API
export const ordersAPI = {
  list: (params?: ListParams) => api.get<PaginatedResponse<Order>>('/orders', { params }),
  get: (id: string) => api.get<Order>(`/orders/${id}`),
  getByNumber: (orderNumber: string) => api.get<Order>(`/orders/number/${orderNumber}`),
  create: (data: Partial<Order>) => api.post<Order>('/orders', data),
  update: (id: string, data: Partial<Order>) => api.put<Order>(`/orders/${id}`, data),
  delete: (id: string) => api.delete(`/orders/${id}`),
  statistics: () => api.get<OrderStatistics>('/orders/statistics'),
};

// Production Management API
export const productionManagementAPI = {
  list: (params?: ListParams) => api.get<PaginatedResponse<ProductionManagement>>('/production-managements', { params }),
  get: (id: string) => api.get<ProductionManagement>(`/production-managements/${id}`),
  create: (data: Partial<ProductionManagement>) => api.post<ProductionManagement>('/production-managements', data),
  update: (id: string, data: Partial<ProductionManagement>) => api.put<ProductionManagement>(`/production-managements/${id}`, data),
  delete: (id: string) => api.delete(`/production-managements/${id}`),
};

// Delivery Management API
export const deliveryManagementAPI = {
  list: (params?: ListParams) => api.get<PaginatedResponse<DeliveryManagement>>('/delivery-managements', { params }),
  get: (id: string) => api.get<DeliveryManagement>(`/delivery-managements/${id}`),
  create: (data: Partial<DeliveryManagement>) => api.post<DeliveryManagement>('/delivery-managements', data),
  update: (id: string, data: Partial<DeliveryManagement>) => api.put<DeliveryManagement>(`/delivery-managements/${id}`, data),
  delete: (id: string) => api.delete(`/delivery-managements/${id}`),
};

// Accounts API
export const accountsAPI = {
  list: (params?: ListParams) => api.get<PaginatedResponse<Account>>('/accounts', { params }),
  get: (id: string) => api.get<Account>(`/accounts/${id}`),
  create: (data: Partial<Account>) => api.post<Account>('/accounts', data),
  update: (id: string, data: Partial<Account>) => api.put<Account>(`/accounts/${id}`, data),
  delete: (id: string) => api.delete(`/accounts/${id}`),
};

// Jobs API
export const jobsAPI = {
  list: (params?: ListParams) => api.get<PaginatedResponse<Job>>('/jobs', { params }),
  get: (id: string) => api.get<Job>(`/jobs/${id}`),
  create: (data: Partial<Job>) => api.post<Job>('/jobs', data),
  update: (id: string, data: Partial<Job>) => api.put<Job>(`/jobs/${id}`),
  delete: (id: string) => api.delete(`/jobs/${id}`),
};

// Applications API
export const applicationsAPI = {
  list: (params?: ListParams) => api.get<PaginatedResponse<Application>>('/applications', { params }),
  get: (id: string) => api.get<Application>(`/applications/${id}`),
  create: (data: Partial<Application>) => api.post<Application>('/applications', data),
  update: (id: string, data: Partial<Application>) => api.put<Application>(`/applications/${id}`, data),
  delete: (id: string) => api.delete(`/applications/${id}`),
};

export default api;
