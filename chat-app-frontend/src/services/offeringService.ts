import api from './authService';

export interface OfferingCheckout {
  approvalUrl: string;
}

export interface Offering {
  _id: string;
  type: 'one_time' | 'subscription';
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  createdAt: string;
}

export interface OfferingStatus {
  isActiveSubscriber: boolean;
  lastOfferingAt: string | null;
  totalOfferings: number;
  totalAmountCents: number;
}

export type SubscriptionTier = 'sub_5' | 'sub_10' | 'sub_20';

export async function createOrderApi(amountUSD: number): Promise<OfferingCheckout> {
  const { data } = await api.post<OfferingCheckout>('/offerings/order', { amount: amountUSD });
  return data;
}

export async function createSubscriptionApi(tier: SubscriptionTier): Promise<OfferingCheckout> {
  const { data } = await api.post<OfferingCheckout>('/offerings/subscription', { tier });
  return data;
}

export async function getOfferingHistoryApi(): Promise<Offering[]> {
  const { data } = await api.get<Offering[]>('/offerings/history');
  return data;
}

export async function getOfferingStatusApi(): Promise<OfferingStatus> {
  const { data } = await api.get<OfferingStatus>('/offerings/status');
  return data;
}
