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
}

export interface CreateListingResponse {
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
): Promise<{ success: true; data: CreateListingResponse } | { success: false; error: ApiError }> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(listingData),
    });

    const responseData = await response.json() as any;

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
 * Gets the base URL for API calls
 * In production, this would be the actual API URL
 */
export function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || 'http://api:3000';
}
