interface RateLimitConfig {
  maxRequestsPerSecond: number
  maxRetries: number
  baseDelay: number
  maxDelay: number
}

export class GoogleCalendarRateLimiter {
  private lastRequestTime = 0
  private requestCount = 0
  private config: RateLimitConfig

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      maxRequestsPerSecond: 10, // Google Calendar API limit is ~10 requests/second
      maxRetries: 3,
      baseDelay: 100, // 100ms base delay
      maxDelay: 5000, // 5 second max delay
      ...config
    }
  }

  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async waitForRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    const minInterval = 1000 / this.config.maxRequestsPerSecond // Minimum time between requests

    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest
      await this.delay(waitTime)
    }

    this.lastRequestTime = Date.now()
    this.requestCount++
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string = 'API call'
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Wait for rate limit before making request
        await this.waitForRateLimit()

        // Execute the operation
        return await operation()

      } catch (error) {
        lastError = error as Error
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        // Check if it's a rate limit error
        if (this.isRateLimitError(errorMessage)) {
          if (attempt < this.config.maxRetries) {
            const delay = this.calculateBackoffDelay(attempt)
            console.log(`Rate limit hit for ${operationName}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.config.maxRetries + 1})`)
            await this.delay(delay)
            continue
          }
        }

        // For non-rate-limit errors, don't retry
        throw error
      }
    }

    throw lastError || new Error(`Failed after ${this.config.maxRetries + 1} attempts`)
  }

  private isRateLimitError(errorMessage: string): boolean {
    const rateLimitPatterns = [
      /rate limit/i,
      /quota exceeded/i,
      /too many requests/i,
      /rate limit exceeded/i,
      /quota/i
    ]

    return rateLimitPatterns.some(pattern => pattern.test(errorMessage))
  }

  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff: baseDelay * 2^attempt, capped at maxDelay
    const delay = this.config.baseDelay * Math.pow(2, attempt)
    return Math.min(delay, this.config.maxDelay)
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime
    }
  }
}

// Create a singleton instance
export const googleCalendarRateLimiter = new GoogleCalendarRateLimiter()
