/**
 * TrustNET AI Warning Banner Module
 * Handles in-page threat warnings with user interaction
 */

class TrustNETWarningBanner {
  constructor() {
    this.bannerId = 'trustnet-ai-warning-banner';
    this.isVisible = false;
    console.log('🚀 TrustNET Warning Banner module initialized');
  }

  /**
   * Show warning banner on page
   * @param {Object} threatData - Threat information from backend
   */
  show(threatData) {
    console.log('📢 Banner.show() called with:', threatData);
    
    // Remove existing banner
    const existingBanner = document.getElementById(this.bannerId);
    if (existingBanner) {
      console.log('🔄 Removing existing banner');
      existingBanner.remove();
    }

    // Remove existing overlay
    const existingOverlay = document.getElementById('trustnet-ai-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    try {
      // Create dark overlay to block page
      const overlay = document.createElement('div');
      overlay.id = 'trustnet-ai-overlay';
      overlay.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(0, 0, 0, 0.7) !important;
        z-index: 2147483646 !important;
        display: block !important;
        visibility: visible !important;
      `;

      // Create banner container
      const banner = document.createElement('div');
      banner.id = this.bannerId;
      
      // Apply styles for full-page modal
      this.applyFullPageStyles(banner);

      // Get threat info
      const threatLevel = this.getThreatLevel(threatData);
      const icon = this.getThreatIcon(threatLevel);
      const message = threatData.message || 'This website may be unsafe. Proceed with caution.';
      const isPhishing = (threatData.reason || '').toLowerCase().includes('phishing');
      const detectionSource = this.getDetectionSource(threatData);

      // Build HTML
      const title = isPhishing 
        ? '🚨 PHISHING ALERT: Known Malicious Website' 
        : '⚠️ WARNING: Potentially Dangerous Website Detected';

      banner.innerHTML = this.buildFullPageHTML(title, icon, message, threatLevel, detectionSource);

      // Insert overlay first
      document.body.appendChild(overlay);
      console.log('✅ Dark overlay added');

      // Insert banner on top
      document.body.appendChild(banner);
      console.log('✅ Full-page banner displayed');

      // Add event listeners
      this.attachEventListeners(banner);

      this.isVisible = true;
      console.log('✅ Modal banner ready');
      
    } catch (error) {
      console.error('❌ Error displaying banner:', error);
    }
  }

  /**
   * Apply CSS styles for full-page modal banner
   */
  applyFullPageStyles(banner) {
    banner.style.cssText = `
      position: fixed !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      z-index: 2147483647 !important;
      background: linear-gradient(135deg, #1f2937 0%, #111827 100%) !important;
      border: 3px solid #dc2626 !important;
      border-radius: 16px !important;
      padding: 40px !important;
      box-sizing: border-box !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif !important;
      color: white !important;
      box-shadow: 0 20px 60px rgba(220, 38, 38, 0.4), 0 0 40px rgba(220, 38, 38, 0.2) !important;
      animation: trustnetPopIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
      max-width: 600px !important;
      width: 90vw !important;
      max-height: 80vh !important;
      overflow-y: auto !important;
      display: flex !important;
      flex-direction: column !important;
      visibility: visible !important;
      opacity: 1 !important;
    `;
  }

  /**
   * Build full-page modal HTML content
   */
  buildFullPageHTML(title, icon, message, threatLevel, detectionSource) {
    return `
      <style>
        @keyframes trustnetPopIn {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.8);
          }
          70% {
            transform: translate(-50%, -50%) scale(1.05);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        @keyframes trustnetPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        #trustnet-ai-warning-banner button {
          transition: all 0.3s ease !important;
        }
        #trustnet-ai-warning-banner button:hover {
          transform: translateY(-3px) !important;
          box-shadow: 0 8px 16px rgba(0,0,0,0.3) !important;
        }
        #trustnet-ai-warning-banner button:active {
          transform: translateY(-1px) !important;
        }
      </style>

      <div style="display: flex; flex-direction: column; align-items: center; gap: 24px; text-align: center;">
        <!-- Icon -->
        <div style="font-size: 80px; animation: trustnetPulse 2s infinite; line-height: 1;">${icon}</div>
        
        <!-- Title -->
        <div style="font-size: 28px; font-weight: 800; color: #ef4444; letter-spacing: 0.5px; line-height: 1.3;">
          ${title}
        </div>

        <!-- Message -->
        <div style="font-size: 16px; color: rgba(255,255,255,0.95); line-height: 1.6; margin: 0;">
          ${message}
        </div>

        <!-- Threat Info -->
        <div style="
          background: rgba(220, 38, 38, 0.1) !important;
          border: 1px solid rgba(220, 38, 38, 0.3) !important;
          border-radius: 8px !important;
          padding: 16px !important;
          width: 100% !important;
          box-sizing: border-box !important;
        ">
          <div style="font-size: 14px; color: rgba(255,255,255,0.9); margin-bottom: 8px;">
            <strong>🔍 Threat Analysis:</strong>
          </div>
          <div style="font-size: 13px; color: rgba(255,255,255,0.8); line-height: 1.6;">
            <div><strong>Threat Level:</strong> ${threatLevel.toUpperCase()}</div>
            <div><strong>Detection Method:</strong> ${detectionSource}</div>
            <div style="margin-top: 8px; color: rgba(255,255,255,0.7);">
              This website has been flagged as potentially dangerous. We recommend leaving immediately.
            </div>
          </div>
        </div>

        <!-- Safety Warning Box -->
        <div style="
          background: rgba(30, 30, 30, 0.5) !important;
          border-left: 4px solid #fbbf24 !important;
          padding: 12px 16px !important;
          border-radius: 4px !important;
          width: 100% !important;
          box-sizing: border-box !important;
        ">
          <div style="font-size: 12px; color: rgba(255,255,255,0.8);">
            ⚠️ <strong>Your personal information and data may be at risk.</strong> Do not enter any passwords or sensitive information on this site.
          </div>
        </div>

        <!-- Buttons -->
        <div style="display: flex; flex-direction: column; gap: 12px; width: 100%; margin-top: 20px;">
          <button id="trustnet-leave-btn" style="
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
            color: white !important;
            border: none !important;
            padding: 14px 28px !important;
            border-radius: 8px !important;
            font-weight: 700 !important;
            font-size: 16px !important;
            cursor: pointer !important;
            box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4) !important;
            width: 100% !important;
            box-sizing: border-box !important;
          ">
            🚫 Leave This Site Immediately
          </button>
          <button id="trustnet-proceed-btn" style="
            background: rgba(255,255,255,0.1) !important;
            color: white !important;
            border: 2px solid rgba(255,255,255,0.3) !important;
            padding: 12px 28px !important;
            border-radius: 8px !important;
            font-weight: 600 !important;
            font-size: 15px !important;
            cursor: pointer !important;
            width: 100% !important;
            box-sizing: border-box !important;
          ">
            ✓ I Understand the Risk - Continue Anyway
          </button>
        </div>

        <!-- Footer -->
        <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 12px; text-align: center;">
          Protected by TrustNET AI • Threat Detection & Prevention
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to banner buttons
   */
  attachEventListeners(banner) {
    // Prevent scrolling on background page
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    console.log('🔒 Background scrolling disabled');

    // Wait for DOM to settle
    setTimeout(() => {
      const leaveBtn = document.getElementById('trustnet-leave-btn');
      const proceedBtn = document.getElementById('trustnet-proceed-btn');

      if (leaveBtn) {
        leaveBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('🚫 User clicked Leave Site - Navigating to safe page');
          document.body.style.overflow = originalOverflow;
          this.hide();
          // Redirect to a safe page after delay
          setTimeout(() => {
            window.location.href = 'https://www.google.com';
          }, 300);
        });
        console.log('✅ Leave button listener attached');
      }

      if (proceedBtn) {
        proceedBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('✓ User clicked Continue Anyway - Removing banner');
          document.body.style.overflow = originalOverflow;
          this.hide();
        });
        console.log('✅ Proceed button listener attached');
      }

      // Prevent closing by clicking overlay
      const overlay = document.getElementById('trustnet-ai-overlay');
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('🔒 Overlay clicked - Cannot close banner this way');
        });
        // Prevent any interaction with elements behind overlay
        overlay.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        console.log('✅ Overlay protection enabled');
      }

      // Prevent closing with Escape key
      const preventEscape = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          console.log('🔒 Escape key blocked - Cannot close banner this way');
        }
      };
      document.addEventListener('keydown', preventEscape);
      console.log('✅ Escape key protection enabled');
    }, 100);
  }

  /**
   * Hide/remove banner and overlay
   */
  hide() {
    const banner = document.getElementById(this.bannerId);
    const overlay = document.getElementById('trustnet-ai-overlay');
    
    if (banner) {
      banner.remove();
      console.log('🔇 Banner hidden');
    }
    
    if (overlay) {
      overlay.remove();
      console.log('🔇 Overlay removed');
    }
    
    this.isVisible = false;
  }

  /**
   * Determine threat level from data
   */
  getThreatLevel(data) {
    if (data.threat_level) {
      return data.threat_level.toLowerCase();
    }
    
    const reason = (data.reason || '').toLowerCase();
    
    if (reason.includes('phishing')) return 'critical';
    if (reason.includes('malware')) return 'critical';
    if (reason.includes('malicious')) return 'high';
    if (reason.includes('suspicious')) return 'medium';
    if (reason.includes('security')) return 'medium';
    
    return 'medium';
  }

  /**
   * Get threat icon based on level
   */
  getThreatIcon(threatLevel) {
    const icons = {
      critical: '🚨',
      high: '⚠️',
      medium: '⚠️',
      low: 'ℹ️'
    };
    return icons[threatLevel.toLowerCase()] || '⚠️';
  }

  /**
   * Get detection source
   */
  getDetectionSource(data) {
    if (data.reason) {
      const reason = data.reason.toLowerCase();
      if (reason.includes('phishing')) return 'Phishing Detection';
      if (reason.includes('malware')) return 'Malware Detection';
      if (reason.includes('security_headers')) return 'Security Analysis';
      if (reason.includes('content_analysis')) return 'Content Analysis';
      return 'Threat Detection';
    }
    return 'TrustNET AI';
  }
}

// Initialize globally
const trustnetBanner = new TrustNETWarningBanner();

console.log('✨ TrustNET Warning Banner module loaded');
