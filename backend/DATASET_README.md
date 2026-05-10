# Local Dataset Integration - TrustNET AI

## Overview
Your **500K+ URL dataset** is now integrated into the TrustNET AI extension as a **fast, offline-first detection layer**. When users visit websites, the system checks them against your local database instantly BEFORE using slower API-based detection methods.

## What Was Implemented

### 1. ✅ Dataset Files Created
- **`legitimate_urls.json`** (50.06 MB)
  - 345,738 legitimate URLs
  - 111,214 unique domains
  
- **`phishing_urls.json`** (25.91 MB)
  - 159,195 phishing URLs
  - 84,243 unique domains

**Total: 504,932 URLs** ✨

### 2. ✅ Backend Integration

#### New Files
- **`local_dataset.py`** - Loads and manages the URL lookups
  - Fast O(1) lookup time (instant)
  - Domain normalization (handles subdomains)
  - Supports both exact URL and domain matching

#### Modified Files  
- **`app.py`** - Added Layer 0 detection
  - Local dataset check runs BEFORE all other checks
  - Returns immediate response for known URLs
  - Falls back to Google Safe Browsing/VirusTotal for unknown URLs

#### Helper Scripts
- **`convert_csv_to_json.py`** - Converts CSV to optimized JSON files
- **`test_dataset.py`** - Unit tests for URL checking
- **`test_api.py`** - REST API endpoint tests

### 3. ✅ Detection Workflow

```
User visits URL
    ↓
Layer 0: Local Dataset Lookup (INSTANT - 500K+ URLs)
    ├─ Found as Legitimate → ✓ Return SAFE immediately
    ├─ Found as Phishing → ✗ Return UNSAFE with alert
    └─ Not found → Continue to Layer 1
    ↓
Layer 1: Google Safe Browsing (if enabled)
    ↓
Layer 2: VirusTotal (if enabled)
    ↓
Layer 3-9: SSL, Headers, Patterns, Reputation, Heuristics, ML, LLM
```

## How It Works

### JSON File Format
Each JSON file contains:
```json
{
  "urls": {
    "https://www.google.com": {
      "domain": "google.com",
      "label": "legitimate"
    },
    ...
  },
  "domains": ["google.com", "facebook.com", ...],
  "metadata": {
    "total_urls": 345738,
    "total_domains": 111214,
    "type": "legitimate"
  }
}
```

### URL Matching Logic
1. **Exact URL Match** - Checks if full URL exists in dataset
2. **Domain Match** - Extracts domain and checks against domain set
   - Handles subdomains (mail.google.com → google.com)
   - Removes www. prefix for normalization

## API Endpoints

### `/check` (POST) - Enhanced with Layer 0
```bash
curl -X POST http://127.0.0.1:5000/check \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.google.com"}'
```

Response for Legitimate URL:
```json
{
  "safe": true,
  "reason": "local_dataset_legitimate",
  "source": "local_dataset",
  "match_type": "exact_url",
  "message": "URL found in local database - Safe"
}
```

Response for Phishing URL:
```json
{
  "safe": false,
  "reason": "local_dataset_phishing",
  "source": "local_dataset",
  "match_type": "domain",
  "message": "URL is CRITICAL Block this Site"
}
```

### `/dataset` (GET) - New endpoint for statistics
```bash
curl http://127.0.0.1:5000/dataset
```

Response:
```json
{
  "status": "success",
  "local_dataset": {
    "loaded": true,
    "legitimate_urls": 345738,
    "phishing_urls": 159194,
    "legitimate_domains": 111214,
    "phishing_domains": 84243,
    "total_urls": 504932
  }
}
```

## Testing

### 1. Unit Tests (Offline)
```bash
cd backend
python test_dataset.py
```
Tests:
- ✓ Legitimate URL detection
- ✓ Domain-based matching  
- ✓ Unknown URL handling

### 2. API Tests (Requires running backend)
```bash
cd backend
python app.py  # Start backend in terminal 1

# In terminal 2:
python test_api.py
```

### 3. Manual Testing
```bash
# Start backend
python app.py

# Test in another terminal
curl -X POST http://127.0.0.1:5000/check \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.google.com"}'
```

## Browser Extension Integration

The extension automatically uses the enhanced `/check` endpoint:

1. **User visits a website**
2. Content script sends URL to backend
3. Backend checks Local Dataset first (Layer 0)
4. Extension displays result:
   - ✓ Green/Safe indicator for legitimate URLs found in dataset
   - ✗ Red alert for phishing URLs found in dataset
   - May show other layers if not found locally

## Performance

- **Local Dataset Lookup**: <1ms (O(1) hash lookup)
- **With JSON Load Time**: ~2-3 seconds backend startup
- **Memory Usage**: ~76 MB for both JSON files loaded in RAM
- **Lookup Time**: Instant after startup

## Benefits

✅ **Offline-First** - Works without internet
✅ **Fast** - 500K+ URLs checked in milliseconds
✅ **Privacy** - No external API calls for known URLs
✅ **Reliable** - Your verified dataset takes priority
✅ **Fallback** - Still uses Google Safe Browsing for unknowns

## Data Format

Original CSV columns:
```
url | legitimate label | phishing label
```

Example:
```
https://www.google.com | legitimate | 
https://phishing-site.xyz | | phishing
```

## Customization

### Update Dataset
To add more URLs to the dataset:
1. Edit `main url final.csv`
2. Run `python convert_csv_to_json.py`
3. Restart backend: `python app.py`

### Modify Detection Order
Edit the `/check` endpoint in `app.py` to change layer priorities.

### Domain Matching
Modify `_extract_domain()` in `local_dataset.py` to change domain normalization.

## Troubleshooting

### Backend won't start
```
Error: Module compiled with NumPy 1.x...
Fix: pip install "numpy<2"
```

### Dataset not loaded
```
Check: http://127.0.0.1:5000/dataset
Verify: JSON files exist in backend/ directory
```

### URLs not being detected
- Check dataset statistics: `curl http://127.0.0.1:5000/dataset`
- Test directly: `python test_dataset.py`
- Verify URL format (http vs https)

## Statistics

### Current Dataset
- **Total URLs**: 504,932
- **Legitimate**: 345,738 (68.5%)
- **Phishing**: 159,195 (31.5%)
- **Unique Domains**: 195,457

### Storage
- JSON Files: ~76 MB
- Memory (loaded): ~80 MB
- CSV Source: ~30 MB

## Next Steps

1. ✅ Start Backend: `python app.py`
2. ✅ Load Extension in Chrome
3. ✅ Test with legitimate URLs (should show safe)
4. ✅ Test with phishing URLs (should show unsafe)
5. ✅ Check alert notifications

## Support

For issues:
1. Check logs in `app.py` console output
2. Verify `/dataset` endpoint shows loaded URLs
3. Run `test_dataset.py` for unit tests
4. Test `/check` endpoint manually with curl

---

**Your local dataset is now protecting users! 🛡️**
