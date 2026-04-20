export function getAppBaseUrl(fallbackOrigin?: string) {
  const configuredUrl =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    fallbackOrigin;

  if (!configuredUrl) {
    throw new Error("Missing app URL. Add APP_BASE_URL to the server environment.");
  }

  const trimmed = configuredUrl.trim().replace(/\/+$/, "");

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export function buildAppUrl(path: string, fallbackOrigin?: string) {
  const baseUrl = getAppBaseUrl(fallbackOrigin);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${baseUrl}${normalizedPath}`;
}
