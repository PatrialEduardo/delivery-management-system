// Best-effort browser geolocation: resolves coordinates when the user
// grants access, or null on denial / timeout / no support. Never rejects,
// so callers can `const geo = await getPositionBestEffort()` unguarded.
export function getPositionBestEffort(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    // Short timeout: a stop should not wait on a slow/denied fix. A
    // cached position (maximumAge) returns instantly on repeat calls.
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 3500, maximumAge: 120_000, enableHighAccuracy: false },
    )
  })
}

// Google Maps "directions to" link. Uses coordinates when the address has
// them, otherwise the text address. Opens the native maps app on mobile.
export function directionsUrl(dest: {
  lat: number | null
  lng: number | null
  addressLine: string
}): string {
  const target =
    dest.lat != null && dest.lng != null ? `${dest.lat},${dest.lng}` : dest.addressLine
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`
}

export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}`
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
