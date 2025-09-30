// Simple metrics implementation for OAuth monitoring
// In production, integrate with Prometheus, DataDog, or similar

interface MetricsData {
  oauthAttempts: number;
  oauthSuccess: number;
  oauthFailures: number;
  discordValidationFailures: number;
  robloxValidationFailures: number;
}

class MetricsCollector {
  private metrics: MetricsData = {
    oauthAttempts: 0,
    oauthSuccess: 0,
    oauthFailures: 0,
    discordValidationFailures: 0,
    robloxValidationFailures: 0,
  };

  incrementOAuthAttempt() {
    this.metrics.oauthAttempts++;
    console.info('METRIC: oauth.attempt', {
      count: this.metrics.oauthAttempts,
    });
  }

  incrementOAuthSuccess() {
    this.metrics.oauthSuccess++;
    console.info('METRIC: oauth.success', { count: this.metrics.oauthSuccess });
  }

  incrementOAuthFailure() {
    this.metrics.oauthFailures++;
    console.info('METRIC: oauth.failure', {
      count: this.metrics.oauthFailures,
    });
  }

  incrementDiscordValidationFailure() {
    this.metrics.discordValidationFailures++;
    console.info('METRIC: discord.validation.failure', {
      count: this.metrics.discordValidationFailures,
    });
  }

  incrementRobloxValidationFailure() {
    this.metrics.robloxValidationFailures++;
    console.info('METRIC: roblox.validation.failure', {
      count: this.metrics.robloxValidationFailures,
    });
  }

  getMetrics(): MetricsData {
    return { ...this.metrics };
  }

  getSuccessRate(): number {
    const total = this.metrics.oauthAttempts;
    return total > 0 ? (this.metrics.oauthSuccess / total) * 100 : 0;
  }
}

// Singleton instance
export const metrics = new MetricsCollector();
