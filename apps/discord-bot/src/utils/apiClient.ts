import fetch from 'node-fetch';
import { z } from 'zod';

// API response schema
const ApiResponseSchema = z.object({
  id: z.string(),
});

export interface CreateListingRequest {
  title: string;
  summary: string;
  price: number;
  category: string;
  sellerId: string;
  guildId?: string;
  visibility?: 'PUBLIC' | 'PRIVATE';
  threadId?: string;
  channelId?: string;
  priceRange?: string;
}

export interface CreateListingResponse {
  id: string;
}

export interface UpdateListingThreadRequest {
  threadId?: string;
  channelId?: string;
  priceRange?: string;
}

export interface FetchListingsRequest {
  page?: number;
  limit?: number;
  status?: string;
  category?: string;
  userId?: string;
  visibility?: string;
  priceRange?: string;
}

export interface ListingResponse {
  id: string;
  title: string;
  summary: string;
  price: number;
  category: string;
  status: string;
  visibility: string;
  threadId?: string;
  channelId?: string;
  priceRange?: string;
  userId: string;
  guildId?: string;
  user: {
    name?: string;
    kycTier?: string;
    kycVerified?: boolean;
  };
  guild?: {
    name: string;
    discordId: string;
  };
  robloxSnapshots?: Array<{
    gameName: string;
    gameDescription?: string;
    thumbnailUrl?: string;
    playerCount?: number;
    visits?: number;
    verifiedOwnership: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface FetchListingsResponse {
  listings: ListingResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
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
 * Fetch listings from the API
 */
export async function fetchListings(
  filters: FetchListingsRequest,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<
  | { success: true; data: FetchListingsResponse }
  | { success: false; error: ApiError }
> {
  try {
    const queryParams = new URLSearchParams();
    if (filters.page) queryParams.append('page', filters.page.toString());
    if (filters.limit) queryParams.append('limit', filters.limit.toString());
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.category) queryParams.append('category', filters.category);
    if (filters.userId) queryParams.append('userId', filters.userId);
    if (filters.visibility)
      queryParams.append('visibility', filters.visibility);
    if (filters.priceRange)
      queryParams.append('priceRange', filters.priceRange);

    const response = await fetch(
      `${apiBaseUrl}/api/listings?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      return {
        success: false,
        error: {
          message: 'Failed to fetch listings',
        },
      };
    }

    const data = (await response.json()) as FetchListingsResponse;

    return {
      success: true,
      data,
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
 * Update listing thread information
 */
export async function updateListingThread(
  listingId: string,
  threadData: UpdateListingThreadRequest,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<{ success: true } | { success: false; error: ApiError }> {
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/listings/${listingId}/thread`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(threadData),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      const errorData = (await response.json()) as ApiError;
      return {
        success: false,
        error: errorData,
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating listing thread:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while updating listing thread',
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
