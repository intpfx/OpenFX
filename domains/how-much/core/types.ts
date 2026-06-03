export interface PriceRecord {
  price: number;
  location: string;
  reportCount: number;
  note: string;
}

export interface UploadPayload {
  productName: string;
  price: number;
  location: string;
  note?: string;
}

export interface ReportPayload {
  productName: string;
  timestamp: string;
}

export interface LocationPayload {
  lat: number;
  lng: number;
}

export interface ProductEntry {
  productName: string;
  price: number;
  location: string;
  reportCount: number;
  note: string;
  timestamp: string;
}

export interface CityPrices {
  city: string;
  prices: Array<{
    price: number;
    note: string;
    date: string;
    reportCount: number;
  }>;
}

export interface CityAverage {
  city: string;
  avgPrice: number;
  prices: Array<{
    price: number;
    note: string;
    date: string;
    reportCount: number;
  }>;
  validCount: number;
  totalCount: number;
}

export interface CityColorMapping {
  city: string;
  avgPrice: number;
  prices: Array<{
    price: number;
    date: string;
    reportCount: number;
    note: string;
  }>;
  color: string;
  normalizedValue: number;
}
