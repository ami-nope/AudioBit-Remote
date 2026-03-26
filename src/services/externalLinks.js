const EXTERNAL_LINKS_URL =
  "https://raw.githubusercontent.com/ami-nope/AudioBit/main/external-links.json";

const DEFAULT_EXTERNAL_LINKS = {
  relay: {
    httpBaseUrl: "https://audiobit-relay-production.up.railway.app/",
    wsUrl: "wss://audiobit-relay-production.up.railway.app/ws",
  },
  remoteWeb: {
    connectBaseUrl: "https://audiobit-remote.vercel.app/connect",
  },
  services: {
    geoIpLookupUrlTemplate: "https://ipapi.co/{ip}/json/",
  },
  project: {
    aboutUrl: "https://github.com/ami-nope/AudioBit",
  },
};

const normalizeUrl = (value, fallback) => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

const normalizeExternalLinks = (value) => ({
  relay: {
    httpBaseUrl: normalizeUrl(
      value?.relay?.http_base_url,
      DEFAULT_EXTERNAL_LINKS.relay.httpBaseUrl
    ),
    wsUrl: normalizeUrl(value?.relay?.ws_url, DEFAULT_EXTERNAL_LINKS.relay.wsUrl),
  },
  remoteWeb: {
    connectBaseUrl: normalizeUrl(
      value?.remote_web?.connect_base_url,
      DEFAULT_EXTERNAL_LINKS.remoteWeb.connectBaseUrl
    ),
  },
  services: {
    geoIpLookupUrlTemplate: normalizeUrl(
      value?.services?.geo_ip_lookup_url_template,
      DEFAULT_EXTERNAL_LINKS.services.geoIpLookupUrlTemplate
    ),
  },
  project: {
    aboutUrl: normalizeUrl(
      value?.project?.about_url,
      DEFAULT_EXTERNAL_LINKS.project.aboutUrl
    ),
  },
});

let cachedExternalLinks = DEFAULT_EXTERNAL_LINKS;
let externalLinksPromise = null;

export const getCachedExternalLinks = () => cachedExternalLinks;

export const getExternalLinks = async () => {
  if (!externalLinksPromise) {
    externalLinksPromise = fetch(EXTERNAL_LINKS_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`External links fetch failed with ${response.status}`);
        }

        const payload = await response.json();
        const normalized = normalizeExternalLinks(payload);
        cachedExternalLinks = normalized;
        return normalized;
      })
      .catch(() => cachedExternalLinks);
  }

  return externalLinksPromise;
};

export { DEFAULT_EXTERNAL_LINKS, EXTERNAL_LINKS_URL };
