export const conferenceCookieName = "confman_conference_id";

type CookieValue = {
  name: string;
  value: string;
};

export function extractAccessToken(cookieValue: string): string | null {
  if (!cookieValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(cookieValue) as unknown;

    if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0].length > 0) {
      return parsed[0];
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "access_token" in parsed &&
      typeof parsed.access_token === "string" &&
      parsed.access_token.length > 0
    ) {
      return parsed.access_token;
    }
  } catch {
    // Ignore parse errors; some cookie formats are plain strings.
  }

  return cookieValue.split(".").length === 3 ? cookieValue : null;
}

export function getAccessTokenFromCookies(cookies: CookieValue[]): string | null {
  for (const cookie of cookies) {
    if (!cookie.name.includes("auth-token")) {
      continue;
    }

    const token = extractAccessToken(cookie.value);
    if (token) {
      return token;
    }
  }

  return null;
}

export function getSelectedConferenceIdFromCookies(cookies: CookieValue[]): string | null {
  const selected = cookies.find((cookie) => cookie.name === conferenceCookieName)?.value;
  if (!selected || selected.trim().length === 0) {
    return null;
  }

  return selected;
}