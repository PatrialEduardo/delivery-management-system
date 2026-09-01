const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('dms_access_token')

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new ApiError(data?.error ?? 'Something went wrong', res.status)
  }

  return data as T
}

export interface LoginResponse {
  accessToken: string
  expiresIn: number
  user: {
    userId: string
    fullName: string
    email: string
  }
}

export interface DeliveryStatus {
  id: string
  code: string
  name: string
  type: 'PROCESS' | 'RESULT'
  colorHex: string
  icon: string | null
  displayOrder: number
  finishesDelivery: boolean
  allowsReschedule: boolean
}

export interface Driver {
  id: string
  fullName: string
  email: string
}

export interface Address {
  id: string
  zipCode: string | null
  street: string
  number: string | null
  district: string | null
  city: string
  state: string
  complement: string | null
  line: string
}

export interface Customer {
  id: string
  fullName: string
  phone: string | null
  addresses: Address[]
}

export interface Delivery {
  id: number
  order: number
  customerId: string
  customerName: string
  addressId: string
  addressLine: string
  statusId: string
  statusCode: string
  statusName: string
  statusColor: string
  attemptNumber: number
  notes: string | null
}

export interface Shipping {
  id: number
  batchCode: string
  deliveryDate: string
  driverUserId: string
  driverName: string
  notes: string | null
  deliveries: Delivery[]
}

export interface StatusCount {
  statusId: string
  code: string
  name: string
  colorHex: string
  count: number
}

export interface HomePayload {
  date: string
  shippings: Shipping[]
  statusSummary: StatusCount[]
}

export interface LinkableDelivery {
  id: number
  customerName: string
  addressLine: string
  statusCode: string
  statusName: string
  statusColor: string
  shippingId: number
  batchCode: string
}

export interface AddressInput {
  zipCode?: string | null
  street: string
  number?: string | null
  district?: string | null
  city: string
  state: string
  complement?: string | null
}

const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') s.set(k, String(v))
  }
  const str = s.toString()
  return str ? `?${str}` : ''
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ userId: string; companyId: string; roleId: string }>('/auth/me'),

  deliveryStatuses: () => request<DeliveryStatus[]>('/delivery-statuses'),
  drivers: () => request<Driver[]>('/drivers'),

  customers: (q?: string) => request<Customer[]>(`/customers${qs({ q })}`),
  createCustomer: (body: {
    fullName: string
    phone?: string | null
    address?: AddressInput
  }) => request<Customer>('/customers', { method: 'POST', body: JSON.stringify(body) }),
  addAddress: (customerId: string, body: AddressInput) =>
    request<Address>(`/customers/${customerId}/addresses`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  shippings: (date: string) => request<HomePayload>(`/shippings${qs({ date })}`),
  createShipping: (body: {
    driverUserId: string
    deliveryDate: string
    notes?: string | null
  }) => request<Shipping>('/shippings', { method: 'POST', body: JSON.stringify(body) }),
  quickAddDelivery: (
    shippingId: number,
    body: { customerId: string; addressId: string; notes?: string | null },
  ) =>
    request<Delivery>(`/shippings/${shippingId}/deliveries`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  linkableDeliveries: (date: string, excludeShipping: number) =>
    request<LinkableDelivery[]>(`/deliveries${qs({ date, excludeShipping })}`),
  linkDelivery: (shippingId: number, deliveryId: number) =>
    request<Delivery>(`/shippings/${shippingId}/deliveries/${deliveryId}/link`, {
      method: 'POST',
    }),

  reorderDeliveries: (shippingId: number, deliveryIds: number[]) =>
    request<{ deliveries: Delivery[] }>(`/shippings/${shippingId}/deliveries/order`, {
      method: 'PATCH',
      body: JSON.stringify({ deliveryIds }),
    }),
}
