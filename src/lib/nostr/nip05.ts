export async function verifyNip05(
  nip05: string,
  pubkeyHex: string,
): Promise<boolean> {
  try {
    if (!nip05 || !pubkeyHex) return false;
    const [name, domain] = nip05.toLowerCase().split("@");
    if (!name || !domain) return false;
    const url =
      `https://${"${"}domain}/.well-known/nostr.json?name=${"${"}encodeURIComponent(name)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return false;
    const json = await res.json();
    const found = json?.names?.[name];
    return typeof found === "string" &&
      found.toLowerCase() === pubkeyHex.toLowerCase();
  } catch {
    return false;
  }
}
