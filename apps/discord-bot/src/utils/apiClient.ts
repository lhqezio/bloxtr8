import fetch from 'node-fetch';
import { z } from 'zod';

// API response schemas
const ApiResponseSchema = z.object({
  id: z.string(),
});

const ListingsResponseSchema = z.object({
  listings: z.array(z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    price: z.number(),
    category: z.string(),
    status: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    userId: z.string(),
    guildId: z.string().nullable(),
    user: z.object({
      name: z.string().nullable(),
      email: z.string(),
    }),
    guild: z.object({
      name: z.string(),
    }).nullable(),
  })),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
});

export interface CreateListingRequest {
  title: string;
  summary: string;
  price: number;
  category: string;
  sellerId: string;
  guildId?: string;
}

export interface CreateListingResponse {
  id: string;
}

export interface FetchListingsRequest {
  page?: number;
  limit?: number;
  status?: string;
  category?: string;
  userId?: string;
}

export interface FetchListingsResponse {
  listings: Array<{
    id: string;
    title: string;
    summary: string;
    price: number;
    category: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    guildId: string | null;
    user: {
      name: string | null;
      email: string;
    };
    guild: {
      name: string;
    } | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiError {
  message: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Creates a listing via the API
 */
export async function createListing(
  listingData: CreateListingRequest,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<
  | { success: true; data: CreateListingResponse }
  | { success: false; error: ApiError }
> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(listingData),
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000), // 10 second timeout for listing creation
    });

    const responseData = (await response.json()) as {
      id?: string;
      message?: string;
      errors?: Array<{
        field: string;
        message: string;
      }>;
    };

    if (!response.ok) {
      return {
        success: false,
        error: {
          message: responseData.message || 'Failed to create listing',
          errors: responseData.errors,
        },
      };
    }

    // Validate response schema
    const validatedData = ApiResponseSchema.parse(responseData);

    return {
      success: true,
      data: validatedData,
    };
  } catch (error) {
    console.error('Error creating listing:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while creating listing',
      },
    };
  }
}

/**
 * Fetches listings from the API with pagination and filtering
 */
export async function fetchListings(
  params: FetchListingsRequest = {},
  apiBaseUrl: string = getApiBaseUrl()
): Promise<
  | { success: true; data: FetchListingsResponse }
  | { success: false; error: ApiError }
> {
  try {
    // Build query string
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.status) queryParams.append('status', params.status);
    if (params.category) queryParams.append('category', params.category);
    if (params.userId) queryParams.append('userId', params.userId);

    const queryString = queryParams.toString();
    const url = `${apiBaseUrl}/api/listings${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseData = (await response.json()) as {
      message?: string;
      errors?: Array<{
        field: string;
        message: string;
      }>;
    };

    if (!response.ok) {
      return {
        success: false,
        error: {
          message: responseData.message || 'Failed to fetch listings',
          errors: responseData.errors,
        },
      };
    }

    // Validate response schema
    const validatedData = ListingsResponseSchema.parse(responseData);

    return {
      success: true,
      data: validatedData,
    };
  } catch (error) {
    console.error('Error fetching listings:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while fetching listings',
      },
    };
  }
}

/**
 * Gets the base URL for API calls
 * In production, this would be the actual API URL
 */
export function getApiBaseUrl(): string {
  const value = process.env.API_BASE_URL;
  // Return default if undefined or empty string
  return value !== undefined && value !== '' ? value : 'http://localhost:3000';
}
