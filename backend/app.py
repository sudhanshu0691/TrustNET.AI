from flask import Flask, request, jsonify
from flask_cors import CORS
from typing import Optional, Dict, Any, List
import os
import sys
from urllib.parse import urlparse
import ssl
import certifi
from datetime import datetime
import hashlib

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Fix joblib hang on Windows - use spawn method
os.environ['JOBLIB_START_METHOD'] = 'spawn'

try:
    import joblib  # type: ignore
except ImportError:
    joblib = None  # type: ignore

try:
    from publicsuffix2 import get_sld  # type: ignore
except ImportError:
    get_sld = None  # type: ignore

import requests
import socket

# Import model handlers and LLM analyzer
from model_handler import ModelHandler
from auto_train import AutoTrainer
from llm_analyzer import LLMAnalyzer
from local_dataset import LocalDataset

app = Flask(__name__)
allowed_origins = os.environ.get('CORS_ORIGINS', '*')
CORS(app, resources={r"/*": {"origins": [origin.strip() for origin in allowed_origins.split(',')]}})

# Initialize model handler (XGBoost + CNN + Random Forest)
backend_dir = os.path.dirname(__file__)
model_handler = ModelHandler(backend_dir)
model = model_handler  # Keep for backward compatibility

# Initialize auto-trainer for weekly retraining
data_dir = os.path.expanduser('~/.trustnet-ai')
os.makedirs(data_dir, exist_ok=True)
auto_trainer = AutoTrainer(data_dir, backend_dir)
auto_trainer.start_background_training()

# Initialize LLM Analyzer (Ollama or OpenAI)
try:
    llm_analyzer = LLMAnalyzer(use_local=True)  # Use local Ollama by default
    print('✓ LLM Analyzer initialized')
except Exception as e:
    print(f'⚠ LLM initialization failed: {e}')
    llm_analyzer = LLMAnalyzer(use_local=False)

# Initialize Local Dataset (JSON-based URL lookup)
print('\n🔄 Initializing Local Dataset...')
local_dataset = LocalDataset(backend_dir)
print()

# Configuration - API keys from environment variables
GOOGLE_SAFE_BROWSING_KEY = os.environ.get('GSB_API_KEY', '')
VIRUSTOTAL_API_KEY = os.environ.get('VT_API_KEY', '')

if GOOGLE_SAFE_BROWSING_KEY:
    print('✓ Google Safe Browsing API key configured')
else:
    print('⚠ Google Safe Browsing API key not set. Get one at: https://developers.google.com/safe-browsing/v4/get-started')

if VIRUSTOTAL_API_KEY:
    print('✓ VirusTotal API key configured')
else:
    print('⚠ VirusTotal API key not set (optional)')

# Suspicious TLDs commonly used in phishing
SUSPICIOUS_TLDS = [
    '.xyz', '.top', '.monster', '.tk', '.ml', '.ga', '.cf', '.gq',
    '.click', '.link', '.download', '.work', '.date', '.racing',
    '.stream', '.review', '.faith', '.loan', '.win', '.bid', '.science'
]

# Trusted brands often impersonated
TRUSTED_BRANDS = [
    'google', 'facebook', 'microsoft', 'amazon', 'paypal', 'apple',
    'netflix', 'instagram', 'twitter', 'linkedin', 'ebay', 'yahoo',
    'bank', 'chase', 'wellsfargo', 'citi', 'americanexpress'
]


def google_safebrowsing_check(url: str) -> Optional[Dict[str, Any]]:
    """Check URL against Google Safe Browsing API (Free tier available)"""
    if not GOOGLE_SAFE_BROWSING_KEY:
        return None
    # Skip check if API key is not configured
    if not GOOGLE_SAFE_BROWSING_KEY.strip():
        return None
    api = 'https://safebrowsing.googleapis.com/v4/threatMatches:find'
    body: Dict[str, Any] = {
        "client": {"clientId": "trustnet-ai", "clientVersion": "1.0"},
        "threatInfo": {
            "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            "platformTypes": ["ANY_PLATFORM"],
            "threatEntryTypes": ["URL"],
            "threatEntries": [{"url": url}]
        }
    }
    try:
        r = requests.post(api, params={'key': GOOGLE_SAFE_BROWSING_KEY}, json=body, timeout=6)
        print(f'GSB API Response: Status={r.status_code}, Body={r.text[:200]}')
        if r.status_code == 200:
            data = r.json()
            if data and 'matches' in data and len(data['matches']) > 0:
                threat_type = data['matches'][0].get('threatType', 'UNKNOWN')
                return {
                    'safe': False, 
                    'source': 'google_safebrowsing', 
                    'threat_type': threat_type,
                    'details': data
                }
        elif r.status_code == 400:
            print('GSB API Error 400:', r.text)
        elif r.status_code == 403:
            print('GSB API Error 403: API key invalid or quota exceeded')
    except Exception as e:
        print('GSB error:', e)
    return None


def virustotal_check(url: str) -> Optional[Dict[str, Any]]:
    """Check URL against VirusTotal database"""
    if not VIRUSTOTAL_API_KEY:
        return None
    
    try:
        # Get URL analysis from VirusTotal
        url_id = hashlib.sha256(url.encode()).hexdigest()
        headers = {'x-apikey': VIRUSTOTAL_API_KEY}
        
        # Submit URL for scanning
        scan_url = 'https://www.virustotal.com/api/v3/urls'
        scan_response = requests.post(
            scan_url, 
            headers=headers, 
            data={'url': url},
            timeout=10
        )
        
        if scan_response.status_code == 200:
            scan_data = scan_response.json()
            analysis_id = scan_data.get('data', {}).get('id', '')
            
            # Get analysis results
            if analysis_id:
                analysis_url = f'https://www.virustotal.com/api/v3/analyses/{analysis_id}'
                analysis_response = requests.get(analysis_url, headers=headers, timeout=10)
                
                if analysis_response.status_code == 200:
                    result = analysis_response.json()
                    stats = result.get('data', {}).get('attributes', {}).get('stats', {})
                    malicious = stats.get('malicious', 0)
                    suspicious = stats.get('suspicious', 0)
                    
                    if malicious > 0 or suspicious > 2:
                        return {
                            'safe': False,
                            'source': 'virustotal',
                            'malicious_count': malicious,
                            'suspicious_count': suspicious,
                            'details': stats
                        }
        
        print('VirusTotal check completed')
    except Exception as e:
        print(f'VirusTotal error: {e}')
    
    return None


def check_ssl_certificate(domain: str) -> Dict[str, Any]:
    """Check SSL certificate validity and security"""
    result = {
        'has_ssl': False,
        'valid': False,
        'expired': False,
        'self_signed': False,
        'issuer': None,
        'valid_from': None,
        'valid_until': None,
        'days_until_expiry': None,
        'warnings': []
    }
    
    try:
        context = ssl.create_default_context(cafile=certifi.where())
        
        with socket.create_connection((domain, 443), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname=domain) as ssock:
                cert = ssock.getpeercert()
                
                result['has_ssl'] = True
                result['issuer'] = dict(x[0] for x in cert.get('issuer', []))
                
                # Check expiration
                not_after = cert.get('notAfter')
                not_before = cert.get('notBefore')
                
                if not_after:
                    expiry_date = datetime.strptime(not_after, '%b %d %H:%M:%S %Y %Z')
                    result['valid_until'] = not_after
                    days_left = (expiry_date - datetime.now()).days
                    result['days_until_expiry'] = days_left
                    
                    if days_left < 0:
                        result['expired'] = True
                        result['warnings'].append('SSL certificate has expired')
                    elif days_left < 30:
                        result['warnings'].append(f'SSL certificate expires soon ({days_left} days)')
                
                if not_before:
                    result['valid_from'] = not_before
                
                # Check if certificate is valid for the domain
                result['valid'] = True
                
    except ssl.SSLError as e:
        result['warnings'].append(f'SSL error: {str(e)}')
        if 'CERTIFICATE_VERIFY_FAILED' in str(e):
            result['self_signed'] = True
            result['warnings'].append('Self-signed or untrusted certificate')
    except socket.timeout:
        result['warnings'].append('Connection timeout while checking SSL')
    except Exception as e:
        result['warnings'].append(f'Cannot verify SSL: {str(e)}')
    
    return result


def check_security_headers(url: str) -> Dict[str, Any]:
    """Check for security headers on the website"""
    result = {
        'headers_present': {},
        'missing_headers': [],
        'security_score': 0,
        'warnings': []
    }
    
    security_headers = [
        'Content-Security-Policy',
        'X-Frame-Options',
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-XSS-Protection',
        'Referrer-Policy',
        'Permissions-Policy'
    ]
    
    try:
        response = requests.get(url, timeout=5, allow_redirects=True)
        headers = response.headers
        
        for header in security_headers:
            if header in headers:
                result['headers_present'][header] = headers[header]
                result['security_score'] += 15
            else:
                result['missing_headers'].append(header)
        
        # Critical headers
        if 'Content-Security-Policy' not in headers:
            result['warnings'].append('Missing Content-Security-Policy (vulnerable to XSS)')
        
        if 'X-Frame-Options' not in headers:
            result['warnings'].append('Missing X-Frame-Options (vulnerable to clickjacking)')
        
        if 'Strict-Transport-Security' not in headers and url.startswith('https'):
            result['warnings'].append('Missing HSTS header (not enforcing HTTPS)')
        
    except Exception as e:
        result['warnings'].append(f'Could not check headers: {str(e)}')
    
    return result


def calculate_reputation_score(url: str, domain: str, features: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate aggregate reputation score based on multiple factors"""
    score = 100  # Start with perfect score
    factors = []
    
    # Domain age check (simplified - in production use WHOIS)
    if len(domain.split('.')[0]) < 4:
        score -= 10
        factors.append('Very short domain name (-10)')
    
    # TLD reputation
    tld = '.' + domain.split('.')[-1] if '.' in domain else ''
    if tld in SUSPICIOUS_TLDS:
        score -= 25
        factors.append(f'Suspicious TLD {tld} (-25)')
    
    # Brand impersonation detection
    domain_lower = domain.lower()
    for brand in TRUSTED_BRANDS:
        if brand in domain_lower and brand not in domain_lower.split('.')[0]:
            # Brand name in subdomain or mixed with other chars
            if not domain_lower.startswith(brand + '.') and not domain_lower.endswith('.' + brand + '.com'):
                score -= 30
                factors.append(f'Possible {brand} impersonation (-30)')
                break
    
    # URL obfuscation
    if features.get('at_count', 0) > 0:
        score -= 20
        factors.append('URL obfuscation with @ symbol (-20)')
    
    # Excessive length
    if features.get('url_length', 0) > 100:
        score -= 15
        factors.append('Excessively long URL (-15)')
    
    # IP address instead of domain
    if features.get('has_ip', 0) == 1:
        score -= 25
        factors.append('Using IP address instead of domain (-25)')
    
    # Too many subdomains
    if features.get('subdomain_count', 0) > 3:
        score -= 20
        factors.append('Too many subdomains (-20)')
    
    # Suspicious keywords
    if features.get('suspicious_words', 0) >= 3:
        score -= 20
        factors.append('Multiple suspicious keywords (-20)')
    
    # High entropy (random characters)
    if features.get('domain_entropy', 0) > 4.5:
        score -= 15
        factors.append('Random-looking domain (-15)')
    
    reputation = 'trusted' if score >= 80 else 'questionable' if score >= 50 else 'suspicious' if score >= 30 else 'dangerous'
    
    return {
        'score': max(0, score),
        'reputation': reputation,
        'factors': factors
    }


def check_url_patterns(url: str, domain: str) -> Optional[Dict[str, Any]]:
    """Advanced URL pattern analysis"""
    warnings = []
    risk_score = 0
    
    # Check for misspelled domains (typosquatting)
    for brand in TRUSTED_BRANDS:
        # Simple Levenshtein-like check
        domain_clean = domain.split('.')[0].lower()
        if brand in domain_clean and brand != domain_clean:
            # Check if it's a small typo
            if abs(len(brand) - len(domain_clean)) <= 2:
                risk_score += 30
                warnings.append(f'Possible typosquatting of {brand}')
    
    # Check for encoded URLs
    encoded_patterns = ['%', '\\x', '\\u', 'xn--']  # URL encoding, unicode escapes, punycode
    for pattern in encoded_patterns:
        if pattern in url.lower():
            risk_score += 15
            warnings.append('URL contains encoded characters')
            break
    
    # Check for data URLs
    if url.startswith('data:'):
        risk_score += 40
        warnings.append('Data URI detected (potential data exfiltration)')
    
    # Check for multiple redirects in URL
    redirect_indicators = ['redirect', 'redir', 'url=', 'link=', 'goto', 'out']
    for indicator in redirect_indicators:
        if indicator in url.lower():
            risk_score += 10
            warnings.append('URL contains redirect indicators')
            break
    
    # Check for suspicious TLD
    tld = '.' + domain.split('.')[-1] if '.' in domain else ''
    if tld in SUSPICIOUS_TLDS:
        risk_score += 20
        warnings.append(f'Suspicious top-level domain: {tld}')
    
    if risk_score >= 30:
        return {
            'safe': False,
            'source': 'url_pattern_analysis',
            'risk_score': risk_score,
            'warnings': warnings
        }
    
    return None


def extract_url_features(url: str, domain: str) -> Dict[str, Any]:
    """Extract heuristic features from URL for ML model and rule-based detection"""
    features: Dict[str, Any] = {}
    
    parsed = urlparse(url)
    
    # Basic URL properties
    features['url_length'] = len(url)
    features['domain_length'] = len(domain)
    features['path_length'] = len(parsed.path)
    features['query_length'] = len(parsed.query) if parsed.query else 0
    
    # Character counts
    features['dot_count'] = domain.count('.')
    features['hyphen_count'] = domain.count('-')
    features['underscore_count'] = domain.count('_')
    features['slash_count'] = url.count('/')
    features['question_count'] = url.count('?')
    features['equal_count'] = url.count('=')
    features['at_count'] = url.count('@')
    features['ampersand_count'] = url.count('&')
    features['digit_count'] = sum(c.isdigit() for c in domain)
    features['special_char_count'] = sum(1 for c in url if c in '!@#$%^&*()_+-=[]{}|;:,.<>?')
    
    # Suspicious patterns
    features['has_ip'] = 1 if is_ip_address(domain) else 0
    features['has_port'] = 1 if ':' in domain and domain.rsplit(':', 1)[-1].isdigit() else 0
    features['subdomain_count'] = max(0, domain.count('.') - 1)
    features['suspicious_words'] = count_suspicious_words(url.lower())
    
    # Domain entropy (randomness indicator)
    features['domain_entropy'] = calculate_entropy(domain)
    
    # URL shortener detection
    shorteners = ['bit.ly', 'goo.gl', 'tinyurl', 't.co', 'ow.ly', 'is.gd', 'buff.ly', 'short.link', 'rebrand.ly']
    features['is_shortener'] = 1 if any(sh in domain for sh in shorteners) else 0
    
    # TLD analysis
    tld = '.' + domain.split('.')[-1] if '.' in domain else ''
    features['suspicious_tld'] = 1 if tld in SUSPICIOUS_TLDS else 0
    
    # Ratio features for better ML performance
    features['domain_to_url_ratio'] = len(domain) / len(url) if len(url) > 0 else 0
    features['path_to_url_ratio'] = len(parsed.path) / len(url) if len(url) > 0 else 0
    
    return features


def is_ip_address(domain: str) -> bool:
    """Check if domain is an IP address"""
    try:
        socket.inet_aton(domain.split(':')[0])
        return True
    except:
        return False


def count_suspicious_words(url: str) -> int:
    """Count suspicious keywords commonly found in phishing URLs"""
    suspicious = [
        'login', 'signin', 'account', 'verify', 'secure', 'update', 
        'confirm', 'bank', 'paypal', 'password', 'suspended', 'locked',
        'click', 'here', 'now', 'urgent', 'immediate', 'alert'
    ]
    return sum(1 for word in suspicious if word in url)


def calculate_entropy(text: str) -> float:
    """Calculate Shannon entropy of text (higher = more random)"""
    import math
    if not text:
        return 0.0
    entropy = 0
    for x in range(256):
        p_x = float(text.count(chr(x))) / len(text)
        if p_x > 0:
            entropy += - p_x * math.log2(p_x)
    return entropy


def rule_based_check(features: Dict[str, Any], url: str, domain: str) -> Optional[Dict[str, Any]]:
    """Apply rule-based heuristics to detect suspicious URLs"""
    risk_score = 0
    reasons: List[str] = []
    
    print(f'🔍 Rule-based check for {domain}:')
    print(f'  Features: {features}')
    
    # IP address instead of domain
    if features['has_ip']:
        risk_score += 30
        reasons.append('Uses IP address instead of domain name')
        print(f'  ⚠ IP address detected (+30 risk)')
    
    # Excessive length
    if features['url_length'] > 75:
        risk_score += 15
        reasons.append('Unusually long URL')
        print(f'  ⚠ Long URL (+15 risk)')
    
    # Too many subdomains
    if features['subdomain_count'] > 3:
        risk_score += 20
        reasons.append('Excessive number of subdomains')
        print(f'  ⚠ Too many subdomains (+20 risk)')
    
    # Many special characters
    if features['hyphen_count'] > 4 or features['underscore_count'] > 3:
        risk_score += 15
        reasons.append('Excessive special characters in domain')
        print(f'  ⚠ Special characters (+15 risk)')
    
    # High domain entropy (random characters)
    if features['domain_entropy'] > 4.5:
        risk_score += 20
        reasons.append('Domain contains random-looking characters')
        print(f'  ⚠ High entropy (+20 risk)')
    
    # Suspicious keywords
    if features['suspicious_words'] >= 3:
        risk_score += 25
        reasons.append('Contains multiple suspicious keywords')
        print(f'  ⚠ Suspicious keywords (+25 risk)')
    
    # @ symbol in URL (can hide real domain)
    if features['at_count'] > 0:
        risk_score += 35
        reasons.append('Contains @ symbol (potential domain spoofing)')
        print(f'  ⚠ @ symbol detected (+35 risk)')
    
    # URL shorteners need additional verification
    if features['is_shortener']:
        risk_score += 10
        reasons.append('Uses URL shortener service')
        print(f'  ⚠ URL shortener (+10 risk)')
    
    print(f'  📊 Total risk score: {risk_score}')
    
    # High risk threshold - balanced for accuracy (35+ for high confidence)
    # Lower threshold (25+) for medium confidence warnings
    if risk_score >= 35:
        return {
            'safe': False,
            'source': 'rule_based_heuristics',
            'risk_score': risk_score,
            'reasons': reasons,
            'message': f'Multiple suspicious patterns detected (risk score: {risk_score}/100)'
        }
    elif risk_score >= 25:
        # Medium risk - flag but don't block
        return {
            'safe': False,
            'source': 'rule_based_heuristics',
            'risk_score': risk_score,
            'reasons': reasons,
            'message': f'Suspicious patterns detected (risk score: {risk_score}/100)'
        }
    
    return None


def ml_check(features: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Use trained ML models to classify URL (XGBoost + CNN + Random Forest ensemble)"""
    if not model_handler.is_available():
        return None
    
    try:
        result = model_handler.predict(features)
        if result:
            # Record verdict for automatic retraining
            auto_trainer.record_verdict('', result['safe'], source='ml_check', features=features)
            
            return {
                'safe': result['safe'],
                'probability': result['confidence'],
                'confidence': result['confidence'],
                'source': 'ml_ensemble',
                'model_type': result['model_type'],
                'models_used': list(result.get('individual_predictions', {}).keys()),
                'message': f'ML ensemble ({result["model_type"]}) prediction with {result["confidence"]*100:.1f}% confidence'
            }
    except Exception as e:
        print(f'ML check error: {e}')
    
    return None


@app.route('/check', methods=['POST'])
def check():
    """Main endpoint to check URL safety through multiple verification layers"""
    data = request.get_json(silent=True) or {}
    hashed_url = data.get('hashed_url')  # For privacy logging (optional)
    if hashed_url:
        print('🔒 Hashed URL provided for privacy logging:', hashed_url)
    url = data.get('url', '')
    domain = data.get('domain') or data.get('host') or ''
    
    if not url and not domain:
        return jsonify({'error': 'URL or domain required'}), 400
    
    # Extract domain from URL if not provided
    if url and not domain:
        try:
            parsed = urlparse(url)
            domain = parsed.netloc or parsed.path.split('/')[0]
            if not domain:
                domain = url.split('/')[0].split('?')[0]
        except Exception as e:
            print(f'Error parsing URL: {e}')
            domain = url.split('/')[0].split('?')[0] if url else ''
    
    # Construct full URL if only domain provided
    if not url and domain:
        url = f"https://{domain}"
    
    # Clean domain (remove port, www, etc.)
    if domain:
        domain = domain.split(':')[0]  # Remove port
        domain = domain.lower().strip()
        if domain.startswith('www.'):
            domain = domain[4:]
    
    print(f'🔍 Checking: {domain} ({url})')
    
    # Extract features for all checks
    features = extract_url_features(url, domain)
    
    # Comprehensive analysis results
    analysis = {
        'url': url,
        'domain': domain,
        'timestamp': datetime.now().isoformat()
    }
    
    # Layer 0: Local Dataset Lookup (Fastest - O(1) lookup against 500K+ URLs)
    print('⚡ Checking Local Dataset...')
    local_check = local_dataset.check_url(url)
    analysis['local_dataset'] = local_check
    
    if local_check['found']:
        if local_check['safe']:
            print(f'✅ Found in Local Whitelist ({local_check["match_type"]} match)')
            return jsonify({
                'safe': True,
                'reason': 'local_dataset_legitimate',
                'source': 'local_dataset',
                'match_type': local_check['match_type'],
                'message': 'url is safe',
                'analysis': analysis
            })
        else:
            print(f'❌ Found in Local Blacklist ({local_check["match_type"]} match)')
            return jsonify({
                'safe': False,
                'reason': 'local_dataset_phishing',
                'source': 'local_dataset',
                'match_type': local_check['match_type'],
                'message': f'URL is CRITICAL Block this Site',
                'analysis': analysis
            })
    
    print('ℹ️  Not in Local Dataset, proceeding to external checks...')
    
    # Layer 1: Google Safe Browsing (most reliable, free API)
    gsb_result = None
    if GOOGLE_SAFE_BROWSING_KEY:
        gsb_result = google_safebrowsing_check(url)
        if gsb_result and not gsb_result['safe']:
            print(f'❌ Blocked by Google Safe Browsing: {gsb_result.get("threat_type")}')
            analysis['gsb_result'] = gsb_result
            return jsonify({
                'safe': False, 
                'reason': 'google_safebrowsing',
                'threat_type': gsb_result.get('threat_type', 'UNKNOWN'),
                'message': 'This website has been identified as dangerous by Google Safe Browsing',
                'analysis': analysis
            })
    
    # Layer 2: VirusTotal Database Check
    vt_result = virustotal_check(url)
    if vt_result and not vt_result['safe']:
        print(f'❌ Blocked by VirusTotal: {vt_result.get("malicious_count")} threats detected')
        analysis['virustotal_result'] = vt_result
        return jsonify({
            'safe': False,
            'reason': 'virustotal',
            'malicious_count': vt_result.get('malicious_count', 0),
            'message': 'This URL has been flagged by multiple security vendors',
            'analysis': analysis
        })
    
    # Layer 3: SSL Certificate Validation
    ssl_check = check_ssl_certificate(domain)
    analysis['ssl_check'] = ssl_check
    
    if ssl_check.get('expired') or ssl_check.get('self_signed'):
        print(f'⚠ SSL issues detected: {ssl_check.get("warnings")}')
        return jsonify({
            'safe': False,
            'reason': 'ssl_certificate_invalid',
            'ssl_issues': ssl_check.get('warnings', []),
            'message': 'Website has SSL/TLS certificate issues',
            'analysis': analysis
        })
    
    # Layer 4: Security Headers Check
    headers_check = check_security_headers(url)
    analysis['security_headers'] = headers_check
    
    # Missing headers alone are not strong phishing indicators for many legitimate sites.
    # Treat this as a warning unless combined with other high-risk signals later.
    if headers_check['security_score'] < 15:
        print(f'⚠ Poor security headers (score: {headers_check["security_score"]})')
        if len(headers_check['warnings']) >= 3 and features.get('suspicious_words', 0) >= 3:
            return jsonify({
                'safe': False,
                'reason': 'missing_security_headers',
                'security_score': headers_check['security_score'],
                'warnings': headers_check['warnings'],
                'message': 'Website lacks critical security headers (vulnerable)',
                'analysis': analysis
            })
    
    # Layer 5: URL Pattern Analysis
    pattern_result = check_url_patterns(url, domain)
    if pattern_result and not pattern_result['safe']:
        print(f'⚠ Suspicious URL patterns detected')
        analysis['pattern_analysis'] = pattern_result
        return jsonify({
            'safe': False,
            'reason': 'suspicious_url_patterns',
            'risk_score': pattern_result['risk_score'],
            'warnings': pattern_result['warnings'],
            'message': 'URL contains suspicious patterns',
            'analysis': analysis
        })
    
    # Layer 6: Reputation Score
    reputation = calculate_reputation_score(url, domain, features)
    analysis['reputation'] = reputation
    
    # Only block if reputation is very low (below 30) for high accuracy
    if reputation['score'] < 30:
        print(f'⚠ Very low reputation score: {reputation["score"]}')
        return jsonify({
            'safe': False,
            'reason': 'low_reputation_score',
            'reputation_score': reputation['score'],
            'reputation': reputation['reputation'],
            'factors': reputation['factors'],
            'message': f'Website has very low reputation score ({reputation["score"]}/100)',
            'analysis': analysis
        })
    
    # Layer 6.5: Aggressive heuristics for obvious phishing attempts
    # Check for brand impersonation + suspicious TLD + no HTTPS
    if not url.startswith('https'):
        # Check for impersonation attempts
        for brand in TRUSTED_BRANDS:
            if brand in domain.lower():
                # Brand name in domain + suspicious TLD + no HTTPS = likely phishing
                if any(tld in domain for tld in SUSPICIOUS_TLDS):
                    print(f'🚨 PHISHING ALERT: Brand impersonation ({brand}) + suspicious TLD + no HTTPS')
                    return jsonify({
                        'safe': False,
                        'reason': 'phishing_pattern_detected',
                        'risk_score': 95,
                        'suspicious_patterns': [
                            f'Impersonates trusted brand: {brand.title()}',
                            'Uses suspicious top-level domain',
                            'Does not use HTTPS encryption'
                        ],
                        'message': f'This appears to be a phishing attempt impersonating {brand.title()}',
                        'analysis': analysis
                    })
    
    # Layer 7: Rule-based heuristics
    rule_result = rule_based_check(features, url, domain)
    if rule_result and not rule_result['safe']:
        print(f'⚠ Blocked by heuristics (score: {rule_result["risk_score"]})')
        analysis['heuristic_analysis'] = rule_result
        # If risk score is high, block immediately
        if rule_result['risk_score'] >= 60:
            return jsonify({
                'safe': False,
                'reason': 'heuristic_analysis',
                'risk_score': rule_result['risk_score'],
                'suspicious_patterns': rule_result['reasons'],
                'message': 'This URL shows suspicious patterns commonly associated with phishing',
                'analysis': analysis
            })
    
    # Layer 8: Machine Learning Model
    ml_result = ml_check(features)
    if ml_result and not ml_result['safe']:
        print(f'🤖 Blocked by ML model (confidence: {ml_result.get("confidence")})')
        analysis['ml_result'] = ml_result
        return jsonify({
            'safe': False,
            'reason': 'ml_classification',
            'probability': ml_result.get('probability'),
            'confidence': ml_result.get('confidence'),
            'message': 'Our machine learning model has classified this URL as potentially dangerous',
            'analysis': analysis
        })
    
    # Layer 9: LLM-based Semantic Analysis (provides explanations)
    try:
        llm_result = llm_analyzer.analyze_url(url, ml_result)
        if llm_result:
            analysis['llm_analysis'] = llm_result
            print(f'📊 LLM Analysis: Threat Level={llm_result.get("threat_level")}, Model={llm_result.get("llm_analysis", {}).get("model_used")}')
            
            # If LLM detects CRITICAL threat, block immediately
            threat_level = llm_result.get('threat_level', '').upper()
            if threat_level == 'CRITICAL':
                print(f'🚨 Blocked by LLM analysis: CRITICAL threat detected')
                return jsonify({
                    'safe': False,
                    'reason': 'llm_critical_threat',
                    'threat_level': 'CRITICAL',
                    'explanation': llm_result.get('explanation', ''),
                    'message': 'Our AI analysis has detected this as a critical threat',
                    'analysis': analysis
                })
            # If LLM detects HIGH threat AND has suspicious patterns, block
            elif threat_level == 'HIGH' and (rule_result and rule_result.get('risk_score', 0) >= 50):
                print(f'🚨 Blocked by LLM + heuristics: HIGH threat detected')
                return jsonify({
                    'safe': False,
                    'reason': 'llm_high_threat',
                    'threat_level': 'HIGH',
                    'explanation': llm_result.get('explanation', ''),
                    'message': 'Multiple security indicators suggest this URL is dangerous',
                    'analysis': analysis
                })
    except Exception as e:
        print(f'⚠ LLM analysis error: {e}')
    
    
    # All checks passed
    print(f'✓ Safe: {domain}')
    response = {
        'safe': True, 
        'reason': 'all_checks_passed',
        'message': 'No threats detected',
        'reputation_score': reputation['score'],
        'analysis': analysis,
        'checks_performed': {
            'google_safe_browsing': bool(GOOGLE_SAFE_BROWSING_KEY),
            'virustotal': bool(VIRUSTOTAL_API_KEY),
            'ssl_certificate': ssl_check.get('has_ssl', False),
            'security_headers': True,
            'url_pattern_analysis': True,
            'reputation_scoring': True,
            'heuristic_analysis': True,
            'ml_model': model_handler.is_available(),
            'llm_analysis': True
        }
    }
    
    # Add LLM explanation if available
    if 'llm_analysis' in analysis:
        response['llm_explanation'] = analysis['llm_analysis'].get('explanation', '')
    
    return jsonify(response)


@app.route('/', methods=['GET'])
def root():
    """Root endpoint - API information"""
    return jsonify({
        'name': 'TrustNET AI Backend API - Enhanced with LLM',
        'version': '2.0.0',
        'status': 'running',
        'endpoints': {
            '/check': 'POST - Check URL safety with multi-layer analysis',
            '/health': 'GET - Health check'
        },
        'features': {
            'ml_models': {
                'xgboost': model_handler.xgb_model is not None,
                'cnn': model_handler.cnn_model is not None,
                'random_forest': model_handler.rf_model is not None,
                'ensemble': model_handler.best_model_type is not None
            },
            'llm_analysis': llm_analyzer is not None,
            'google_safe_browsing': bool(GOOGLE_SAFE_BROWSING_KEY),
            'virustotal': bool(VIRUSTOTAL_API_KEY),
            'auto_retraining': True
        }
    })


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_handler': model_handler.is_available(),
        'llm_analyzer': llm_analyzer is not None,
        'auto_trainer': auto_trainer is not None,
        'gsb_enabled': bool(GOOGLE_SAFE_BROWSING_KEY),
        'vt_enabled': bool(VIRUSTOTAL_API_KEY),
        'models': {
            'xgboost': model_handler.xgb_model is not None,
            'cnn': model_handler.cnn_model is not None,
            'random_forest': model_handler.rf_model is not None
        }
    })


@app.route('/dataset', methods=['GET'])
def dataset_stats():
    """Get local dataset statistics"""
    stats = local_dataset.get_stats()
    return jsonify({
        'status': 'success',
        'local_dataset': stats,
        'message': f'Local dataset loaded with {stats["total_urls"]:,} URLs',
        'breakdown': {
            'legitimate_urls': f'{stats["legitimate_urls"]:,}',
            'phishing_urls': f'{stats["phishing_urls"]:,}',
            'legitimate_domains': f'{stats["legitimate_domains"]:,}',
            'phishing_domains': f'{stats["phishing_domains"]:,}'
        }
    })


if __name__ == '__main__':
    print('\n' + '='*60)
    print('🛡️  TrustNET AI Backend Server - Enhanced Security with LLM')
    print('='*60)
    print(f'XGBoost Model: {"✓ Loaded" if model_handler.xgb_model else "✗ Not found"}')
    print(f'CNN Model: {"✓ Loaded" if model_handler.cnn_model else "✗ Not found"}')
    print(f'Random Forest: {"✓ Loaded" if model_handler.rf_model else "✗ Not found"}')
    print(f'ML Ensemble: {"✓ Available" if model_handler.best_model_type else "✗ No models loaded"}')
    print(f'LLM Analyzer: {"✓ Initialized" if llm_analyzer else "✗ Failed"}')
    print(f'Auto Retraining: {"✓ Enabled" if auto_trainer else "✗ Disabled"}')
    print(f'Google Safe Browsing: {"✓ Enabled" if GOOGLE_SAFE_BROWSING_KEY else "✗ Disabled"}')
    print(f'VirusTotal: {"✓ Enabled" if VIRUSTOTAL_API_KEY else "✗ Disabled (optional)"}')
    
    # Print local dataset stats
    dataset_stats = local_dataset.get_stats()
    print(f'\nLocal Dataset: {"✓ Loaded" if dataset_stats["loaded"] else "✗ Not loaded"}')
    if dataset_stats["loaded"]:
        print(f'  Total URLs: {dataset_stats["total_urls"]:,}')
        print(f'  Legitimate: {dataset_stats["legitimate_urls"]:,} ({dataset_stats["legitimate_domains"]:,} domains)')
        print(f'  Phishing: {dataset_stats["phishing_urls"]:,} ({dataset_stats["phishing_domains"]:,} domains)')
    
    print('\nSecurity Checks Enabled (in order of priority):')
    print('  ⚡ Layer 0: Local Dataset Lookup (500K+ URLs)')
    print('  1️⃣  Layer 1: Google Safe Browsing')
    print('  2️⃣  Layer 2: VirusTotal Database')
    print('  3️⃣  Layer 3: SSL/TLS Certificate Validation')
    print('  4️⃣  Layer 4: Security Headers Verification')
    print('  5️⃣  Layer 5: URL Pattern Analysis')
    print('  6️⃣  Layer 6: Website Reputation Scoring')
    print('  7️⃣  Layer 7: Heuristic Analysis')
    print('  8️⃣  Layer 8: Machine Learning Detection (Ensemble)')
    print('  9️⃣  Layer 9: LLM-based Semantic Analysis')
    print('  🔄 Weekly: Automatic Model Retraining')
    print('='*60 + '\n')
    app.run(debug=os.environ.get('FLASK_DEBUG', '0') == '1', port=5000)
