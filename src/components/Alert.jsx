import React from 'react'
import { addToWhitelist } from '../utils/apiHandler'

export default function Alert({url, reason, onWhitelist, details}){
  const [showDetails, setShowDetails] = React.useState(false)
  const [threatLevel, setThreatLevel] = React.useState('high')
  const [threatTypes, setThreatTypes] = React.useState([])

  React.useEffect(() => {
    // Determine threat level and types based on reason and details
    const reasonLower = (reason || '').toLowerCase()
    const message = (details?.message || '').toLowerCase()
    const threatType = (details?.threat_type || '').toLowerCase()
    
    let types = []
    let level = 'high'
    
    // Analyze threat type - Check local_dataset_phishing FIRST
    if(reasonLower.includes('local_dataset_phishing')){
      level = 'critical'
      types.push('📊 Found in Phishing Database')
      types.push('Known Phishing URL')
    }
    else if(reasonLower.includes('google_safebrowsing') || threatType.includes('malware')){
      level = 'critical'
      types.push('Malware')
    }
    else if(reasonLower.includes('phish') || reasonLower.includes('social_engineering') || threatType.includes('social_engineering')){
      level = 'critical'
      types.push('Phishing')
    }
    else if(reasonLower.includes('heuristic') || reasonLower.includes('suspicious')){
      level = 'high'
      types.push('Suspicious Pattern')
    }
    else if(reasonLower.includes('ml_model') || reasonLower.includes('ml_classification')){
      const prob = details?.probability || 0
      level = prob > 0.8 ? 'critical' : 'high'
      types.push('AI Detection')
    }
    
    if(details?.suspicious_patterns && details.suspicious_patterns.length > 0){
      types = [...types, ...details.suspicious_patterns.slice(0, 3)]
    }
    
    if(types.length === 0){
      types = ['Unknown Threat']
    }
    
    setThreatLevel(level)
    setThreatTypes(types)
  }, [reason, details])

  const leaveSite = ()=>{
    try {
      if (!chrome || !chrome.tabs || !chrome.storage || !chrome.storage.local) {
        console.warn('⚠️ Chrome APIs not available')
        window.close()
        return
      }
      chrome.tabs.query({active:true,currentWindow:true},tabs=>{
        if(tabs[0]) {
          // Close the tab
          chrome.tabs.remove(tabs[0].id)
          // Update blocked count
          chrome.storage.local.get(['trustnet_ai_stats'], res=>{
            const s = res.trustnet_ai_stats || {total: 0, safe: 0, unsafe: 0, blocked: 0}
            s.blocked++
            chrome.storage.local.set({trustnet_ai_stats: s})
          })
          window.close()
        }
      })
    } catch(e) {
      console.error('❌ Error in leaveSite:', e)
      window.close()
    }
  }

  const ignoreOnce = ()=>{
    // Just close the popup, user can continue browsing
    window.close()
  }

  const handleAddToWhitelist = async ()=>{
    try {
      const domain = new URL(url).hostname
      await addToWhitelist(domain)
      if(onWhitelist) onWhitelist()
      window.close()
    } catch(e){
      console.error('Error adding to whitelist:', e)
      alert('Failed to add to whitelist')
    }
  }

  const getThreatConfig = () => {
    switch(threatLevel) {
      case 'critical':
        return {
          icon: '🚨',
          progressBar: 'bg-red-600',
          tipBorder: 'border-red-500',
          gradient: 'from-red-50 to-red-100',
          border: 'border-red-400',
          title: 'CRITICAL THREAT DETECTED',
          badge: 'bg-red-600 text-white',
          textColor: 'text-red-900',
          tagColor: 'bg-red-100 text-red-700 border-red-300'
        }
      case 'high':
        return {
          icon: '⚠️',
          progressBar: 'bg-orange-600',
          tipBorder: 'border-orange-500',
          gradient: 'from-orange-50 to-orange-100',
          border: 'border-orange-400',
          title: 'High Risk Website',
          badge: 'bg-orange-600 text-white',
          textColor: 'text-orange-900',
          tagColor: 'bg-orange-100 text-orange-700 border-orange-300'
        }
      case 'medium':
        return {
          icon: '⚡',
          progressBar: 'bg-yellow-600',
          tipBorder: 'border-yellow-500',
          gradient: 'from-yellow-50 to-yellow-100',
          border: 'border-yellow-400',
          title: 'Suspicious Activity Detected',
          badge: 'bg-yellow-600 text-white',
          textColor: 'text-yellow-900',
          tagColor: 'bg-yellow-100 text-yellow-700 border-yellow-300'
        }
      default:
        return {
          icon: '⚠️',
          progressBar: 'bg-orange-600',
          tipBorder: 'border-orange-500',
          gradient: 'from-orange-50 to-orange-100',
          border: 'border-orange-400',
          title: 'Potentially Unsafe Website',
          badge: 'bg-orange-600 text-white',
          textColor: 'text-orange-900',
          tagColor: 'bg-orange-100 text-orange-700 border-orange-300'
        }
    }
  }

  const config = getThreatConfig()

  return (
    <div className={`bg-gradient-to-br ${config.gradient} border-2 ${config.border} rounded-xl p-4 shadow-xl animate-slide-up flex-shrink-0 w-full max-h-[85vh] overflow-y-auto scrollbar-thin flex flex-col gap-2 backdrop-blur-sm`}>
      {/* Header */}
      <div className="flex items-start gap-3 flex-shrink-0">
        <div className={`w-12 h-12 ${config.badge} rounded-full flex items-center justify-center text-3xl shadow-lg flex-shrink-0 animate-bounce`}>
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h2 className={`font-bold ${config.textColor} text-base break-words`}>{config.title}</h2>
            <span className={`px-2.5 py-0.5 ${config.badge} text-xs rounded-full uppercase font-bold whitespace-nowrap`}>
              {threatLevel}
            </span>
          </div>
          <p className={`text-sm ${config.textColor} font-medium opacity-95 break-words`}>
            {details?.message || reason || 'This website may be unsafe'}
          </p>
        </div>
      </div>

      {/* Threat Categories */}
      {threatTypes.length > 0 && (
        <div className="p-2.5 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
          <div className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-1.5">🔍 Detected Issues:</div>
          <div className="flex flex-wrap gap-1.5">
            {threatTypes.map((threat, idx) => (
              <span key={idx} className={`px-2 py-1 ${config.tagColor} text-xs rounded-md font-semibold border-2 backdrop-blur-sm`}>
                {threat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Risk Score */}
      {details?.risk_score && (
        <div className="p-2.5 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
          <div className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-1.5">⚡ Risk Score:</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-400 dark:bg-gray-600 rounded-full h-2.5">
              <div 
                className={`${config.progressBar} h-2.5 rounded-full transition-all duration-500`}
                style={{width: `${Math.min(details.risk_score, 100)}%`}}
              ></div>
            </div>
            <span className={`text-xs font-bold ${config.textColor}`}>{details.risk_score}%</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-1.5 flex-shrink-0">
        <div className="flex gap-1.5">
          <button 
            className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-1.5 text-xs"
            onClick={leaveSite}
          >
            <span>🚫</span>
            <span>Leave Now</span>
          </button>
          <button 
            className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-1.5 text-xs"
            onClick={ignoreOnce}
          >
            <span>👁️</span>
            <span>Ignore</span>
          </button>
        </div>
        <div className="flex gap-1.5">
          <button 
            className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-lg hover:shadow-xl transition-all duration-200 text-xs"
            onClick={handleAddToWhitelist}
          >
            ✓ Whitelist
          </button>
          <button 
            className="px-3 py-2 bg-white/20 hover:bg-white/30 border-2 border-white/30 rounded-lg font-bold shadow-lg hover:shadow-xl transition-all duration-200 text-xs text-white"
            onClick={()=>setShowDetails(s=>!s)}
          >
            {showDetails ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Technical Details */}
      {showDetails && details && (
        <div className="p-2.5 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
          <div className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-1.5">📋 Details:</div>
          <div className="max-h-24 overflow-y-auto scrollbar-thin">
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-black/30 p-1.5 rounded border border-white/10">
              {JSON.stringify(details, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Security Tip */}
      <div className={`p-2.5 bg-white/10 backdrop-blur-sm rounded-lg border-l-4 ${config.tipBorder} font-semibold flex-shrink-0 text-xs text-gray-700 dark:text-gray-300`}>
        <span>💡 </span> Never enter passwords or financial info on suspicious sites. Always verify the URL.
      </div>
    </div>
  )
}
