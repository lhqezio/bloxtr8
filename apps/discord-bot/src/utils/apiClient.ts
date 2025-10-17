import fetch from 'node-fetch';
import { z } from 'zod';

// API response schema
const ApiResponseSchema = z.object({
  id: z.string(),
});

export interface CreateListingRequest {
  title: string;
  summary: string;
  price: number | string; // Accept both number and string (will be converted to BigInt)
  category: string;
  sellerId: string;
  guildId?: string;
  visibility?: 'PUBLIC' | 'PRIVATE';
  messageId?: string;
  channelId?: string;
  priceRange?: string;
}

export interface CreateListingResponse {
  id: string;
}

export interface UpdateListingMessageRequest {
  messageId?: string;
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
  price: string; // BigInt serialized as string
  category: string;
  status: string;
  visibility: string;
  messageId?: string;
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

export interface CreateOfferRequest {
  listingId: string;
  buyerId: string;
  amount: string; // BigInt as string
  conditions?: string;
  expiry?: string; // ISO datetime string, defaults to 7 days on server
}

export interface CreateOfferResponse {
  id: string;
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
 * Update listing message information
 */
export async function updateListingMessage(
  listingId: string,
  messageData: UpdateListingMessageRequest,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<{ success: true } | { success: false; error: ApiError }> {
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/listings/${listingId}/message`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData),
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
    console.error('Error updating listing message:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while updating listing message',
      },
    };
  }
}

/**
 * Create an offer via the API
 */
export async function createOffer(
  offerData: CreateOfferRequest,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<
  | { success: true; data: CreateOfferResponse }
  | { success: false; error: ApiError }
> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/offers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(offerData),
      signal: AbortSignal.timeout(10000), // 10 second timeout
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
          message: responseData.message || 'Failed to create offer',
          errors: responseData.errors,
        },
      };
    }

    // Validate response has id
    if (!responseData.id) {
      return {
        success: false,
        error: {
          message: 'Invalid response from server',
        },
      };
    }

    return {
      success: true,
      data: { id: responseData.id },
    };
  } catch (error) {
    console.error('Error creating offer:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while creating offer',
      },
    };
  }
}

/**
 * Get a single listing by ID
 */
export async function getListing(
  listingId: string,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<
  { success: true; data: ListingResponse } | { success: false; error: ApiError }
> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/listings/${listingId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiError;
      return {
        success: false,
        error: errorData,
      };
    }

    const data = (await response.json()) as ListingResponse;

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('Error fetching listing:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while fetching listing',
      },
    };
  }
}

/**
 * Accept an offer
 */
export async function acceptOffer(
  offerId: string,
  userId: string,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<{ success: true } | { success: false; error: ApiError }> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/offers/${offerId}/accept`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(10000),
    });

    const responseData = (await response.json()) as {
      success?: boolean;
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
          message: responseData.message || 'Failed to accept offer',
          errors: responseData.errors,
        },
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Error accepting offer:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while accepting offer',
      },
    };
  }
}

/**
 * Decline an offer
 */
export async function declineOffer(
  offerId: string,
  userId: string,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<{ success: true } | { success: false; error: ApiError }> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/offers/${offerId}/decline`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(10000),
    });

    const responseData = (await response.json()) as {
      success?: boolean;
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
          message: responseData.message || 'Failed to decline offer',
          errors: responseData.errors,
        },
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Error declining offer:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while declining offer',
      },
    };
  }
}

/**
 * Counter an offer
 */
export async function counterOffer(
  offerId: string,
  userId: string,
  amount: string,
  conditions?: string,
  expiry?: string,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<
  | { success: true; data: { id: string; amount: string } }
  | { success: false; error: ApiError }
> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/offers/${offerId}/counter`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, amount, conditions, expiry }),
      signal: AbortSignal.timeout(10000),
    });

    const responseData = (await response.json()) as {
      success?: boolean;
      counterOffer?: {
        id: string;
        amount: string;
      };
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
          message: responseData.message || 'Failed to counter offer',
          errors: responseData.errors,
        },
      };
    }

    if (!responseData.counterOffer) {
      return {
        success: false,
        error: {
          message: 'Invalid response from server',
        },
      };
    }

    return {
      success: true,
      data: responseData.counterOffer,
    };
  } catch (error) {
    console.error('Error countering offer:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while countering offer',
      },
    };
  }
}

/**
 * Get all offers for a listing
 */
export async function getOffersForListing(
  listingId: string,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<
  | {
      success: true;
      data: {
        offers: Array<{
          id: string;
          amount: string;
          conditions?: string;
          expiry: string;
          status: string;
          createdAt: string;
          buyer: {
            id: string;
            name: string;
            kycTier: string;
            kycVerified: boolean;
          };
        }>;
        count: number;
      };
    }
  | { success: false; error: ApiError }
> {
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/offers/listing/${listingId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
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

    const data = (await response.json()) as {
      offers: Array<{
        id: string;
        amount: string;
        conditions?: string;
        expiry: string;
        status: string;
        createdAt: string;
        buyer: {
          id: string;
          name: string;
          kycTier: string;
          kycVerified: boolean;
        };
      }>;
      count: number;
    };

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('Error fetching offers for listing:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while fetching offers',
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
