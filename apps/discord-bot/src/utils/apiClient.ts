import fetch, { type Response } from 'node-fetch';
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

export interface CreateOfferDraftRequest {
  discordUserId: string;
  listingId: string;
  amount: string; // BigInt as string
  conditions?: string;
  expiresAt?: string; // ISO datetime string
}

export interface OfferDraftResponse {
  id: string;
  discordUserId: string;
  listingId: string;
  amount: string; // BigInt as string
  conditions?: string;
  expiresAt: string;
  createdAt: string;
}

export interface ApiError {
  message: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Helper function to parse error responses from the API
 */
async function parseErrorResponse(response: Response): Promise<ApiError> {
  try {
    // Get the response text first (can only be called once)
    const responseText = await response.text();
    
    // Check if the content type indicates JSON
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    
    if (isJson) {
      try {
        // Attempt to parse as JSON
        const responseData = JSON.parse(responseText) as {
          message?: string;
          errors?: string[];
        };
        return {
          message:
            responseData.message ||
            `HTTP ${response.status}: ${response.statusText}`,
          errors: responseData.errors?.map(error => ({
            field: 'general',
            message: error,
          })),
        };
      } catch {
        // JSON parsing failed for content-type: application/json
        // Return the raw response text with context
        return {
          message: `HTTP ${response.status}: ${response.statusText}. Invalid JSON in response body: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`,
        };
      }
    } else {
      // Non-JSON response (HTML, plain text, etc.)
      // Preserve the actual response body for debugging
      const truncatedBody = responseText.length > 500 
        ? responseText.substring(0, 500) + '...' 
        : responseText;
      return {
        message: `HTTP ${response.status}: ${response.statusText}. Response body: ${truncatedBody}`,
      };
    }
  } catch (error) {
    // If we can't read the response at all, include the error details
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      message: `HTTP ${response.status}: ${response.statusText}. Failed to read response: ${errorMessage}`,
    };
  }
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
      const errorData = await parseErrorResponse(response);
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
      const errorData = await parseErrorResponse(response);
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
    const response = await fetch(
      `${apiBaseUrl}/api/offers/${offerId}/decline`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
        signal: AbortSignal.timeout(10000),
      }
    );

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
    const response = await fetch(
      `${apiBaseUrl}/api/offers/${offerId}/counter`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, amount, conditions, expiry }),
        signal: AbortSignal.timeout(10000),
      }
    );

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
      const errorData = await parseErrorResponse(response);
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
 * Create or update an offer draft
 */
export async function createOfferDraft(
  draftData: CreateOfferDraftRequest,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<
  | { success: true; data: OfferDraftResponse }
  | { success: false; error: ApiError }
> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/offer-drafts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draftData),
      signal: AbortSignal.timeout(10000),
    });

    const responseData = (await response.json()) as
      | OfferDraftResponse
      | ApiError;

    if (!response.ok) {
      return {
        success: false,
        error: responseData as ApiError,
      };
    }

    return {
      success: true,
      data: responseData as OfferDraftResponse,
    };
  } catch (error) {
    console.error('Error creating offer draft:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while creating offer draft',
      },
    };
  }
}

/**
 * Get an offer draft
 */
export async function getOfferDraft(
  discordUserId: string,
  listingId: string,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<
  | { success: true; data: OfferDraftResponse }
  | { success: false; error: ApiError }
> {
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/offer-drafts/${discordUserId}/${listingId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      const errorData = await parseErrorResponse(response);
      return {
        success: false,
        error: errorData,
      };
    }

    const data = (await response.json()) as OfferDraftResponse;

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('Error fetching offer draft:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while fetching offer draft',
      },
    };
  }
}

/**
 * Delete an offer draft
 */
export async function deleteOfferDraft(
  discordUserId: string,
  listingId: string,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<{ success: true } | { success: false; error: ApiError }> {
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/offer-drafts/${discordUserId}/${listingId}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok && response.status !== 204) {
      const errorData = await parseErrorResponse(response);
      return {
        success: false,
        error: errorData,
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting offer draft:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while deleting offer draft',
      },
    };
  }
}

/**
 * Get contract details
 */
export async function getContract(
  contractId: string,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<
  { success: true; data: any } | { success: false; error: ApiError }
> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/contracts/${contractId}`, {
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

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching contract:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while fetching contract',
      },
    };
  }
}

/**
 * Sign a contract
 */
export async function signContract(
  contractId: string,
  userId: string,
  signatureMethod: 'DISCORD_NATIVE' | 'WEB_BASED' = 'DISCORD_NATIVE',
  apiBaseUrl: string = getApiBaseUrl()
): Promise<
  { success: true; data: any } | { success: false; error: ApiError }
> {
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/contracts/${contractId}/sign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          signatureMethod,
          // Note: IP address and user agent would be captured on server side for Discord
        }),
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

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error signing contract:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while signing contract',
      },
    };
  }
}

/**
 * Generate contract signing token for web app
 */
export async function generateContractSignToken(
  contractId: string,
  userId: string,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<
  { success: true; data: any } | { success: false; error: ApiError }
> {
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/contracts/${contractId}/sign-token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
        }),
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

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error generating contract sign token:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while generating sign token',
      },
    };
  }
}

/**
 * Generate contract from accepted offer
 */
export async function generateContract(
  offerId: string,
  apiBaseUrl: string = getApiBaseUrl()
): Promise<
  { success: true; data: any } | { success: false; error: ApiError }
> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/contracts/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        offerId,
      }),
      signal: AbortSignal.timeout(30000), // Longer timeout for PDF generation
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiError;
      return {
        success: false,
        error: errorData,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error generating contract:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while generating contract',
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
