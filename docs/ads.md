# Ads

## Provider path

| Stage | Provider | Role |
|-------|----------|------|
| Primary display | **Google AdSense** | Rails + bottom banners |
| Fallback display | **Adsterra** banners only | Same layout if AdSense rejects/limits |
| Rewarded | **Adsterra** rewarded | Once per UTC day for shop points (signed-in) |

Do **not** enable popunders, push, or random interstitials. No paid ad-removal SKU.

## Environment

```bash
VITE_ADS_ENABLED=true
# adsense | adsterra | none
VITE_ADS_PROVIDER=adsense

# AdSense
VITE_ADSENSE_CLIENT_ID=ca-pub-xxxxxxxx
VITE_ADSENSE_RAIL_LEFT_SLOT=
VITE_ADSENSE_RAIL_LEFT_WIDTH=160
VITE_ADSENSE_RAIL_LEFT_HEIGHT=600
VITE_ADSENSE_RAIL_RIGHT_SLOT=
VITE_ADSENSE_RAIL_RIGHT_WIDTH=160
VITE_ADSENSE_RAIL_RIGHT_HEIGHT=600
VITE_ADSENSE_BOTTOM_SLOT=
VITE_ADSENSE_BOTTOM_WIDTH=728
VITE_ADSENSE_BOTTOM_HEIGHT=90

# Adsterra (fallback display + rewarded)
VITE_ADSTERRA_INVOKE_HOST=www.highperformanceformat.com
VITE_ADSTERRA_RAIL_LEFT_KEY=
VITE_ADSTERRA_RAIL_RIGHT_KEY=
VITE_ADSTERRA_BOTTOM_KEY=
VITE_ADSTERRA_REWARDED_KEY=
VITE_REWARDED_AD_POINTS=15
```

Paste authorized seller lines into [`public/ads.txt`](../public/ads.txt) after network approval.

## Placements

| Slot | Where |
|------|--------|
| `rail_left` / `rail_right` | Desktop side rails (hidden on narrow viewports) |
| `bottom` | Bottom bar on all pages including play |
| Rewarded CTA | Bottom bar; sign-in required to claim |

## Database

Migration `20260720050000_rewarded_ad_points.sql` adds once-daily `claim_rewarded_ad_points` / `get_rewarded_ad_claim_status`.
