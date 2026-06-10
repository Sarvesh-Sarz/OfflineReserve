/**
 * PrivacyFilter.js
 * Every URL and page passes through here before being cached.
 * If it fails any check — it is silently dropped. No exceptions.
 */

// Domains that are ALWAYS blocked — no matter what
const BLOCKED_DOMAINS = [
  // Banking & finance
  'netbanking', 'banking', 'bank', 'paytm.com', 'phonepe.com',
  'gpay.app', 'upi', 'razorpay.com', 'paypal.com',

  // Personal communication
  'mail.google.com', 'outlook.live.com', 'mail.yahoo.com',

  // Messaging
  'web.whatsapp.com', 'telegram.org', 'messenger.com',
  'discord.com', 'slack.com',

  // Auth / login infrastructure
  'accounts.google.com', 'login.microsoftonline.com',
  'auth0.com', 'okta.com', 'signin',

  // Health & sensitive
  'practo.com', 'apollohospitals.com',
];

// URL patterns that are always blocked
const BLOCKED_PATTERNS = [
  /login/i,
  /signin/i,
  /signup/i,
  /logout/i,
  /password/i,
  /checkout/i,
  /payment/i,
  /billing/i,
  /account\/settings/i,
  /profile\/edit/i,
  /\/api\//i,         // raw API calls — never cache
  /\/graphql/i,
  /\.xml$/i,          // sitemaps, feeds with personal data
];

// Content types that should never be cached
const BLOCKED_CONTENT_TYPES = [
  'application/json',    // API responses
  'application/xml',
  'text/xml',
  'multipart/form-data', // form submissions
];

class PrivacyFilter {
  /**
   * Main check — call this before caching anything.
   * Returns { allowed: true/false, reason: string }
   */
  static check(url, contentType = '', isPrivateBrowsing = false) {
    // Rule 1 — Never cache incognito / private browsing
    if (isPrivateBrowsing) {
      return { allowed: false, reason: 'private_browsing' };
    }

    // Rule 2 — Must be a valid URL
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { allowed: false, reason: 'invalid_url' };
    }

    // Rule 3 — Only cache HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { allowed: false, reason: 'non_http' };
    }

    // Rule 4 — Block known sensitive domains
    const hostname = parsed.hostname.toLowerCase();
    const isBlockedDomain = BLOCKED_DOMAINS.some(domain =>
      hostname.includes(domain)
    );
    if (isBlockedDomain) {
      return { allowed: false, reason: 'blocked_domain' };
    }

    // Rule 5 — Block sensitive URL patterns
    const fullUrl = url.toLowerCase();
    const isBlockedPattern = BLOCKED_PATTERNS.some(pattern =>
      pattern.test(fullUrl)
    );
    if (isBlockedPattern) {
      return { allowed: false, reason: 'blocked_pattern' };
    }

    // Rule 6 — Block sensitive content types
    if (contentType) {
      const isBlockedType = BLOCKED_CONTENT_TYPES.some(type =>
        contentType.includes(type)
      );
      if (isBlockedType) {
        return { allowed: false, reason: 'blocked_content_type' };
      }
    }

    // Rule 7 — Block pages that require login (has auth query params)
    const authParams = ['token', 'auth', 'session', 'jwt', 'access_token'];
    const hasAuthParam = authParams.some(param =>
      parsed.searchParams.has(param)
    );
    if (hasAuthParam) {
      return { allowed: false, reason: 'auth_params' };
    }

    // Passed all checks
    return { allowed: true, reason: 'ok' };
  }

  /**
   * Quick boolean check for convenience
   */
  static isAllowed(url, contentType = '', isPrivateBrowsing = false) {
    return this.check(url, contentType, isPrivateBrowsing).allowed;
  }
}

export default PrivacyFilter;
