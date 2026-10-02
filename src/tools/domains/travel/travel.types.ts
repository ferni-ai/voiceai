/**
 * Travel Types
 *
 * Flight, hotel and saved-trip types used by the travel domain tools.
 */

export type TripType = 'roundtrip' | 'oneway' | 'multicity';
export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

export interface FlightSearch {
  id: string;
  userId: string;
  origin: string;
  destination: string;
  departureDate: Date;
  returnDate?: Date;
  tripType: TripType;
  passengers: number;
  cabinClass: CabinClass;
  results?: FlightResult[];
  createdAt: Date;
}

export interface FlightResult {
  id: string;
  airline: string;
  price: number;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  stops: number;
  bookingUrl?: string;
}

export interface HotelSearch {
  id: string;
  userId: string;
  destination: string;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  rooms: number;
  results?: HotelResult[];
  createdAt: Date;
}

export interface HotelResult {
  id: string;
  name: string;
  rating: number;
  pricePerNight: number;
  totalPrice: number;
  amenities: string[];
  bookingUrl?: string;
}

export interface SavedTrip {
  id: string;
  userId: string;
  name: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  flight?: FlightResult;
  hotel?: HotelResult;
  notes?: string;
  totalBudget?: number;
  createdAt: Date;
}
