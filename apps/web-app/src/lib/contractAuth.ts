/**
 * Contract signing authentication helper
 * Validates sign tokens for web-based contract signing
 */

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export interface ContractAuthResult {
  success: boolean
  contractId?: string
  userId?: string
  error?: string
}

/**
 * Validate contract signing token
 */
export async function validateSignToken(
  token: string,
  signal?: AbortSignal,
): Promise<ContractAuthResult> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/contracts/validate-token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
        signal,
      },
    )

    if (!response.ok) {
      const error = await response.json()
      return {
        success: false,
        error: error.message || 'Invalid or expired token',
      }
    }

    const data = await response.json()
    return {
      success: true,
      contractId: data.contractId,
      userId: data.userId,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request was cancelled',
      }
    }
    console.error('Error validating sign token:', error)
    return {
      success: false,
      error: 'Network error occurred',
    }
  }
}

/**
 * Fetch contract details
 */
export async function fetchContract(contractId: string, signal?: AbortSignal) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/contracts/${contractId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
      },
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to fetch contract')
    }

    return await response.json()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request was cancelled')
    }
    console.error('Error fetching contract:', error)
    throw error
  }
}

/**
 * Get client IP address
 */
async function getClientIpAddress(): Promise<string> {
  try {
    // Try to get IP from a service
    const response = await fetch('https://api.ipify.org?format=json', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    if (response.ok) {
      const data = await response.json()
      return data.ip
    }
  } catch (error) {
    console.error('Error fetching IP address:', error)
  }

  // Fallback to unknown if we can't fetch IP
  return 'unknown'
}

/**
 * Sign contract via web app
 */
export async function signContractWeb(
  contractId: string,
  userId: string,
  token: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get user agent from browser
    const userAgent = navigator.userAgent

    // Get IP address (may take a moment)
    const ipAddress = await getClientIpAddress()

    const response = await fetch(
      `${API_BASE_URL}/api/contracts/${contractId}/sign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          signatureMethod: 'WEB_BASED',
          token, // Include token for validation
          ipAddress,
          userAgent,
        }),
      },
    )

    if (!response.ok) {
      const error = await response.json()
      return {
        success: false,
        error: error.message || 'Failed to sign contract',
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Error signing contract:', error)
    return {
      success: false,
      error: 'Network error occurred',
    }
  }
}

/**
 * Get contract PDF URL
 */
export async function getContractPdfUrl(
  contractId: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/contracts/${contractId}/pdf`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
      },
    )

    if (!response.ok) {
      throw new Error('Failed to get PDF URL')
    }

    const data = await response.json()
    return data.downloadUrl
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request was cancelled')
    }
    console.error('Error getting PDF URL:', error)
    throw error
  }
}
