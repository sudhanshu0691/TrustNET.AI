// Content script - detects unsafe sites and shows in-page warnings
(async function() {
  try {
    console.log('🔍 TrustNET AI detector.js loaded and running');
    const url = window.location.href;
    
    // Skip internal pages
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
      console.log('⏭️ Skipping internal page:', url);
      return;
    }

    const domain = window.location.hostname;
    console.log('🌐 Analyzing URL:', domain);

    // Check if already whitelisted
    const isWhitelisted = await checkWhitelist(domain);
    if (isWhitelisted) {
      console.log('✅ Domain is whitelisted:', domain);
      return;
    }

    // Check if protection is enabled
    const protectionEnabled = await checkProtectionStatus();
    if (!protectionEnabled) {
      console.log('🔴 Protection is disabled - Enable it in extension popup!');
      return;
    }

    console.log('🛡️ Protection enabled, analyzing page content...');

    // Perform local content analysis
    const contentThreats = analyzePageContent();
    const jsThreats = analyzeJavaScriptBehavior();
    
    console.log('📊 Content Threats:', contentThreats.risk_score, '| JS Threats:', jsThreats.risk_score);
    
    // If critical local threats detected, show warning immediately
    if (contentThreats.risk_score > 50 || jsThreats.risk_score > 50) {
      console.log('⚠️ CRITICAL LOCAL THREATS DETECTED! Showing banner immediately');
      const localThreatData = {
        safe: false,
        reason: 'local_content_analysis',
        message: 'Suspicious content detected on this page',
        threat_level: 'high',
        content_threats: contentThreats,
        js_threats: jsThreats
      };
      trustnetBanner.show(localThreatData);
      return;
    }

    // Hash URL for privacy
    const hashedUrl = await hashUrl(url);

    // Check URL safety with backend
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch('http://127.0.0.1:5000/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: url,
          hashed_url: hashedUrl, 
          domain: domain,
          content_analysis: {
            content_threats: contentThreats,
            js_threats: jsThreats
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('🔐 TrustNET AI Backend Response:', data);

      // If site is unsafe, show warning banner
      if (data.safe === false) {
        console.log('🚨 Showing warning banner for unsafe URL:', domain);
        trustnetBanner.show(data);
      } else if (data.safe === true) {
        console.log('✅ URL is safe:', domain);
      } else {
        console.log('⚠️ Unknown safety status for:', domain, data);
      }
    } catch (error) {
      // Log error for debugging
      console.log('TrustNET AI detector error:', error.message);
    }
  } catch (error) {
    console.log('TrustNET AI detector error:', error);
  }
})();

function analyzePageContent() {
  /**
   * Criterion 6: Content Inspection
   * Detects fake login forms, hidden fields, suspicious iframes, phishing templates
   */
  const threats = [];
  let risk_score = 0;
  
  try {
    // Check for password input fields
    const passwordFields = document.querySelectorAll('input[type="password"]');
    const emailFields = document.querySelectorAll('input[type="email"], input[name*="email"], input[name*="user"]');
    
    if (passwordFields.length > 0) {
      // Check if form submits to external domain
      passwordFields.forEach(field => {
        const form = field.closest('form');
        if (form) {
          const action = form.action;
          if (action && !action.includes(window.location.hostname)) {
            risk_score += 30;
            threats.push('Login form submits to external domain');
          }
        }
      });
      
      // Check for forms without HTTPS
      if (!window.location.protocol.startsWith('https')) {
        risk_score += 25;
        threats.push('Password field on non-HTTPS page');
      }
    }
    
    // Check for hidden form fields (potential data exfiltration)
    const hiddenFields = document.querySelectorAll('input[type="hidden"]');
    if (hiddenFields.length > 10) {
      risk_score += 15;
      threats.push(`Excessive hidden form fields (${hiddenFields.length})`);
    }
    
    // Check for suspicious iframes
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      const src = iframe.src;
      if (src) {
        // Cross-domain iframe
        if (!src.includes(window.location.hostname) && !src.startsWith('about:')) {
          risk_score += 10;
          threats.push('Cross-domain iframe detected');
        }
        
        // Hidden iframe
        const style = window.getComputedStyle(iframe);
        if (style.display === 'none' || style.visibility === 'hidden' || 
            parseInt(style.width) < 10 || parseInt(style.height) < 10) {
          risk_score += 20;
          threats.push('Hidden iframe detected (potential data exfiltration)');
        }
      }
    });
    
    // Check for fake login page indicators
    const pageText = document.body.innerText.toLowerCase();
    const urgentKeywords = ['account suspended', 'verify now', 'click here immediately', 
                           'urgent action required', 'account will be closed', 
                           'confirm your identity'];
    
    for (const keyword of urgentKeywords) {
      if (pageText.includes(keyword)) {
        risk_score += 15;
        threats.push(`Urgency-creating language detected: "${keyword}"`);
        break;
      }
    }
    
    // Check for suspicious external links
    const links = document.querySelectorAll('a[href]');
    let externalLinks = 0;
    links.forEach(link => {
      const href = link.href;
      if (href && !href.includes(window.location.hostname)) {
        externalLinks++;
      }
    });
    
    if (links.length > 0 && externalLinks / links.length > 0.8) {
      risk_score += 10;
      threats.push('Majority of links point to external sites');
    }
    
  } catch (error) {
    console.log('Content analysis error:', error);
  }
  
  return {
    risk_score: Math.min(risk_score, 100),
    threats: threats,
    threat_count: threats.length
  };
}

function analyzeJavaScriptBehavior() {
  /**
   * Criterion 5: JavaScript Behavior Analysis
   * Detects crypto-mining, keyloggers, hidden redirects, obfuscated code
   */
  const threats = [];
  let risk_score = 0;
  
  try {
    // Check all script tags
    const scripts = document.querySelectorAll('script');
    
    scripts.forEach(script => {
      const scriptContent = script.innerHTML;
      
      if (scriptContent) {
        // Check for obfuscated JavaScript
        const obfuscationIndicators = [
          /eval\(/gi,
          /atob\(/gi,
          /fromCharCode/gi,
          /\\x[0-9a-f]{2}/gi,
          /\\u[0-9a-f]{4}/gi,
          /_0x[0-9a-f]+/gi
        ];
        
        let obfuscationScore = 0;
        obfuscationIndicators.forEach(pattern => {
          const matches = scriptContent.match(pattern);
          if (matches && matches.length > 3) {
            obfuscationScore++;
          }
        });
        
        if (obfuscationScore >= 3) {
          risk_score += 25;
          threats.push('Heavily obfuscated JavaScript detected');
        }
        
        // Check for crypto-mining indicators
        const cryptoMiningKeywords = [
          'cryptonight', 'coinhive', 'crypto-loot', 'minero', 'webminer',
          'coinimp', 'miner', 'hashalot', 'cryptocpu'
        ];
        
        for (const keyword of cryptoMiningKeywords) {
          if (scriptContent.toLowerCase().includes(keyword)) {
            risk_score += 40;
            threats.push('Crypto-mining script detected');
            break;
          }
        }
        
        // Check for keylogger patterns
        const keyloggerPatterns = [
          /addEventListener\s*\(\s*['"]keypress['"]/gi,
          /addEventListener\s*\(\s*['"]keydown['"]/gi,
          /onkeypress\s*=/gi,
          /document\.onkeydown/gi
        ];
        
        let keyloggerMatches = 0;
        keyloggerPatterns.forEach(pattern => {
          if (pattern.test(scriptContent)) {
            keyloggerMatches++;
          }
        });
        
        if (keyloggerMatches >= 2 && scriptContent.includes('XMLHttpRequest')) {
          risk_score += 35;
          threats.push('Potential keylogger detected (keyboard monitoring + data transmission)');
        }
        
        // Check for automatic redirects
        const redirectPatterns = [
          /window\.location\s*=\s*['"][^'"]+['"]/gi,
          /window\.location\.href\s*=\s*['"][^'"]+['"]/gi,
          /window\.location\.replace/gi,
          /meta.*http-equiv.*refresh/gi
        ];
        
        redirectPatterns.forEach(pattern => {
          if (pattern.test(scriptContent)) {
            risk_score += 10;
            threats.push('Automatic redirect detected');
          }
        });
      }
      
      // Check external script sources
      if (script.src) {
        const src = script.src.toLowerCase();
        
        // Suspicious domains
        const suspiciousDomains = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz'];
        for (const tld of suspiciousDomains) {
          if (src.includes(tld)) {
            risk_score += 15;
            threats.push(`External script from suspicious domain: ${tld}`);
            break;
          }
        }
      }
    });
    
    // Check for clipboard hijacking
    if (typeof navigator.clipboard !== 'undefined') {
      // This is a simplified check - in reality, monitoring actual clipboard access is complex
      const clipboardScripts = Array.from(scripts).some(s => 
        s.innerHTML.includes('clipboard.writeText') || 
        s.innerHTML.includes('clipboard.readText')
      );
      
      if (clipboardScripts) {
        risk_score += 10;
        threats.push('Page accesses clipboard');
      }
    }
    
  } catch (error) {
    console.log('JS behavior analysis error:', error);
  }
  
  return {
    risk_score: Math.min(risk_score, 100),
    threats: threats,
    threat_count: threats.length
  };
}

async function hashUrl(url) {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkWhitelist(domain) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(['trustnet_ai_whitelist'], (res) => {
        const whitelist = res.trustnet_ai_whitelist || [];
        resolve(whitelist.includes(domain));
      });
    } catch (e) {
      resolve(false);
    }
  });
}

async function checkProtectionStatus() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(['trustnet_ai_protection'], (res) => {
        resolve(res.trustnet_ai_protection !== false); // Default to true
      });
    } catch (e) {
      resolve(true);
    }
  });
}

function getThreatLevel(data) {
  const reason = (data.reason || '').toLowerCase();
  if (reason.includes('google_safebrowsing') || reason.includes('malware') || reason.includes('phishing')) {
    return 'critical';
  }
  if (data.probability && data.probability > 0.8) {
    return 'critical';
  }
  if (data.risk_score && data.risk_score > 70) {
    return 'high';
  }
  return 'medium';
}

function getDetectionSource(data) {
  const reason = (data.reason || '').toLowerCase();
  
  if (reason.includes('local_dataset_phishing')) {
    return '📊 Found in Phishing Database';
  } else if (reason.includes('local_dataset_legitimate')) {
    return '✓ Found in Legitimate Database';
  } else if (reason.includes('google_safebrowsing')) {
    return '🔍 Google Safe Browsing';
  } else if (reason.includes('virustotal')) {
    return '🛡️ VirusTotal Check';
  } else if (reason.includes('ml_classification')) {
    return '🤖 AI Detection Model';
  } else if (reason.includes('ssl') || reason.includes('certificate')) {
    return '🔒 SSL Certificate Check';
  } else if (reason.includes('heuristic')) {
    return '📈 Heuristic Analysis';
  } else {
    return data.reason || 'Unknown Check';
  }
}

function getThreatIcon(level) {
  switch (level) {
    case 'critical': return '🚨';
    case 'high': return '⚠️';
    case 'medium': return '⚡';
    default: return '⚠️';
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UNSAFE_SITE_DETECTED') {
    console.log('📨 Message from background script:', message.data);
    trustnetBanner.show(message.data);
  }
});

// ==========================================
// DEBUG & TEST FUNCTIONS - Run from console
// ==========================================

/**
 * Test the banner display
 * Usage in console: window.testBannerPhishing()
 */
window.testBannerPhishing = function() {
  console.log('🧪 Testing PHISHING alert banner...');
  const testData = {
    safe: false,
    reason: 'phishing_detected',
    message: 'This website is flagged as a phishing site attempting to steal your credentials and personal information.',
    threat_level: 'critical'
  };
  trustnetBanner.show(testData);
};

/**
 * Test the banner with high threat
 * Usage in console: window.testBannerMalware()
 */
window.testBannerMalware = function() {
  console.log('🧪 Testing MALWARE alert banner...');
  const testData = {
    safe: false,
    reason: 'malware_detected',
    message: 'This website contains malicious software that could harm your computer.',
    threat_level: 'critical'
  };
  trustnetBanner.show(testData);
};

/**
 * Test the banner with medium threat
 * Usage in console: window.testBannerSuspicious()
 */
window.testBannerSuspicious = function() {
  console.log('🧪 Testing SUSPICIOUS website alert banner...');
  const testData = {
    safe: false,
    reason: 'suspicious_activity',
    message: 'This website shows signs of suspicious activity and may not be safe.',
    threat_level: 'high'
  };
  trustnetBanner.show(testData);
};

/**
 * Check detector status
 * Usage in console: window.checkTrustNETStatus()
 */
window.checkTrustNETStatus = function() {
  console.log('=== TrustNET AI STATUS CHECK ===');
  console.log('Page URL:', window.location.href);
  console.log('Domain:', window.location.hostname);
  console.log('Banner Module Available:', typeof trustnetBanner !== 'undefined');
  
  // Check chrome APIs
  if (typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined') {
    console.log('✅ Chrome Extension APIs Available');
  } else {
    console.error('❌ Chrome Extension APIs NOT available');
  }
  
  // Check storage
  if (typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined') {
    console.log('✅ Chrome Storage API Available');
  } else {
    console.error('❌ Chrome Storage API NOT available');
  }
  
  console.log('📋 Available Test Commands:');
  console.log('  • window.testBannerPhishing() - Test phishing alert');
  console.log('  • window.testBannerMalware() - Test malware alert');
  console.log('  • window.testBannerSuspicious() - Test suspicious alert');
  console.log('  • window.checkTrustNETStatus() - Check status');
};

console.log('✨ TrustNET AI Detector Initialized');
console.log('💡 For debugging, use: window.checkTrustNETStatus() or window.testBannerPhishing()');
