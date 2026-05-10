import React, { useEffect, useState } from 'react'
import Alert from './Alert'
import Whitelist from './Whitelist'
import History from './History.jsx'
import Settings from './Settings.jsx'
import { getCurrentTabUrl, sendCheckRequest } from '../utils/apiHandler'

const HISTORY_KEY = 'trustnet_ai_history'
const STATS_KEY = 'trustnet_ai_stats'

export default function Popup(){
  const [url, setUrl] = useState('')
  const [inputUrl, setInputUrl] = useState('')
  const [result, setResult] = useState(null)
  const [tab, setTab] = useState('overview')
  const [showWhitelist, setShowWhitelist] = useState(false)
  const [stats, setStats] = useState({total: 0, safe: 0, unsafe: 0, blocked: 0})
  const [isProtected, setIsProtected] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(()=>{
    loadStats()
    loadProtectionStatus()
    
    ;(async ()=>{
      try {
        console.log('🚀 [Popup] Initializing popup...')
        const u = await getCurrentTabUrl()
        console.log('📍 [Popup] Current tab URL fetched:', u)
        
        if(u) {
          setUrl(u)
          setInputUrl(u)
          
          // Check protection status and run check if enabled
          chrome.storage.local.get(['trustnet_ai_protection'], (res) => {
            const isEnabled = res.trustnet_ai_protection ?? true
            console.log('🔒 [Popup] Protection status:', isEnabled)
            
            if(isEnabled) {
              console.log('🔍 [Popup] Auto-checking current tab URL...')
              doCheck(u)
            } else {
              console.log('⚠️ [Popup] Protection is disabled, skipping auto-check')
            }
          })
        } else {
          console.warn('⚠️ [Popup] No URL found for current tab')
        }
      } catch (error) {
        console.error('❌ [Popup] Error initializing popup:', error)
      }
    })()
  },[])


  function loadStats(){
    try{
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('⚠️ [Popup] chrome.storage not available')
        return
      }
      chrome.storage.local.get([STATS_KEY], res=>{
        setStats(res[STATS_KEY] || {total: 0, safe: 0, unsafe: 0, blocked: 0})
      })
    }catch(e){console.error('❌ [Popup] loadStats error:', e)}
  }

  function loadProtectionStatus(){
    try{
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('⚠️ [Popup] chrome.storage not available')
        setIsProtected(true) // Default to enabled
        return
      }
      chrome.storage.local.get(['trustnet_ai_protection'], res=>{
        setIsProtected(res.trustnet_ai_protection ?? true)
      })
    }catch(e){console.error('❌ [Popup] loadProtectionStatus error:', e)}
  }

  function updateStats(isSafe, wasBlocked = false){
    try{
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('⚠️ [Popup] chrome.storage not available for updateStats')
        return
      }
      chrome.storage.local.get([STATS_KEY], res=>{
        const s = res[STATS_KEY] || {total: 0, safe: 0, unsafe: 0, blocked: 0}
        s.total++
        if(isSafe) s.safe++
        else s.unsafe++
        if(wasBlocked) s.blocked++
        chrome.storage.local.set({[STATS_KEY]: s})
        setStats(s)
      })
    }catch(e){console.error('❌ [Popup] updateStats error:', e)}
  }

  async function doCheck(targetUrl){
    console.log('🔍 [Popup] Starting URL check for:', targetUrl)
    setResult({checking:true})
    try {
      const res = await sendCheckRequest(targetUrl)
      console.log('✅ [Popup] Backend Response:', {
        safe: res.safe,
        reason: res.reason,
        message: res.message,
        fullResponse: res
      })
      console.log('🎯 [Popup] Setting result state to:', {safe: res.safe, reason: res.reason})
      setResult(res)
      if (!res?.error && typeof res?.safe === 'boolean') {
        updateStats(res.safe)
      }
      await pushHistory({url: targetUrl, safe: !!res.safe, reason: res.reason || 'none', ts: Date.now(), details: res})
    } catch(e) {
      console.error('❌ [Popup] Error during check:', e)
      setResult({
        safe: null,
        error: true,
        reason: 'popup_error',
        message: 'Error checking URL: ' + e.message
      })
    }
  }

  function pushHistory(item){
    return new Promise((resolve) => {
      try{
        if (!chrome || !chrome.storage || !chrome.storage.local) {
          console.warn('⚠️ [Popup] chrome.storage not available for pushHistory')
          resolve()
          return
        }
        chrome.storage.local.get([HISTORY_KEY], res=>{
          const list = res[HISTORY_KEY] || []
          list.unshift(item)
          const next = list.slice(0,50)
          chrome.storage.local.set({[HISTORY_KEY]: next}, ()=>{
            resolve()
          })
        })
      }catch(e){
        console.error('❌ [Popup] pushHistory error:', e)
        resolve()
      }
    })
  }

  const onManualCheck = async ()=>{
    if(!inputUrl) return
    await doCheck(inputUrl)
    setUrl(inputUrl)
  }

  const toggleProtection = ()=>{
    const next = !isProtected
    setIsProtected(next)
    try{
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('⚠️ [Popup] chrome.storage not available for toggleProtection')
        return
      }
      chrome.storage.local.set({trustnet_ai_protection: next})
    }catch(e){console.error('❌ [Popup] toggleProtection error:', e)}
  }

  return (
    <div className="font-sans bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 flex flex-col rounded-xl shadow-2xl" style={{width: '420px', minHeight: '550px'}}>
      {/* Header - Premium Design */}
      <header className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 px-6 py-4 flex-shrink-0 rounded-t-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-xl rounded-xl flex items-center justify-center shadow-lg border border-white/30 hover:bg-white/30 transition-all">
              <span className="text-2xl">🛡️</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">TrustNET AI</h1>
              <p className="text-xs text-blue-100">Advanced Web Protection</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleProtection}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                isProtected 
                  ? 'bg-green-400 text-slate-900 border-green-300 shadow-lg' 
                  : 'bg-red-400 text-slate-900 border-red-300'
              }`}
            >
              {isProtected ? '🟢 Active' : '🔴 Off'}
            </button>
          </div>
        </div>

        {/* Stats Grid - Modern Cards */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Total', value: stats.total, color: 'from-blue-400 to-blue-600', icon: '📊' },
            { label: 'Safe', value: stats.safe, color: 'from-green-400 to-green-600', icon: '✅' },
            { label: 'Threats', value: stats.unsafe, color: 'from-red-400 to-red-600', icon: '⚠️' },
            { label: 'Blocked', value: stats.blocked, color: 'from-orange-400 to-orange-600', icon: '🚫' }
          ].map((stat, i) => (
            <div key={i} className="bg-white/10 backdrop-blur-xl rounded-lg p-2 border border-white/20 hover:bg-white/20 transition-all">
              <div className="text-xs text-blue-100 font-medium">{stat.label}</div>
              <div className="text-lg font-bold text-white mt-1">{stat.value}</div>
            </div>
          ))}
        </div>
      </header>

      {/* Navigation Tabs - Modern Style */}
      <nav className="bg-white/5 backdrop-blur-sm px-3 py-3 flex gap-1 border-b border-white/10 flex-shrink-0">
        {[
          {id: 'overview', icon: '🏠', label: 'Overview'},
          {id: 'history', icon: '📋', label: 'History'},
          {id: 'settings', icon: '⚙️', label: 'Settings'}
        ].map(item => (
          <button 
            key={item.id}
            className={`px-4 py-2 rounded-lg font-semibold text-xs transition-all ${
              tab === item.id 
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg' 
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`} 
            onClick={() => setTab(item.id)}
          >
            <span className="mr-1">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Content Area */}
      <div className="flex-1 bg-gradient-to-b from-slate-700 to-slate-800 overflow-y-auto scrollbar-thin">
        <div className="flex flex-col gap-3 p-4">
          {tab==='overview' && (
            <>
              {/* URL Input Section */}
              <div className="bg-white/15 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-lg hover:bg-white/20 transition-all">
                <label className="text-xs font-bold text-blue-200 mb-2 block">🔍 Check Website</label>
                <div className="flex gap-2">
                  <input 
                    className="flex-1 px-4 py-2.5 bg-white/20 border border-white/40 rounded-lg focus:border-blue-300 focus:outline-none transition-all text-white placeholder-gray-300 text-sm" 
                    value={inputUrl} 
                    onChange={e=>setInputUrl(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && inputUrl && onManualCheck()}
                    placeholder="Enter URL to scan..."
                    type="url"
                  />
                  <button 
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 text-sm" 
                    onClick={onManualCheck}
                    disabled={!inputUrl || result?.checking}
                  >
                    {result?.checking ? '⏳' : '🔍'}
                  </button>
                </div>
              </div>

              {/* Results Section */}
              {result?.checking ? (
                <div className="flex-1 flex items-center justify-center bg-white/15 backdrop-blur-xl rounded-xl p-8 border border-white/30 shadow-lg">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-300 border-t-blue-500 mb-3"></div>
                    <p className="text-sm text-blue-50 font-medium">Analyzing website...</p>
                  </div>
                </div>
              ) : result?.safe === true ? (
                <div className="bg-gradient-to-br from-green-500/30 to-emerald-600/30 border-2 border-green-400/70 rounded-xl p-4 backdrop-blur-xl shadow-lg">
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">✅</div>
                    <div>
                      <h3 className="font-bold text-green-50 text-base">Safe Website</h3>
                      <p className="text-sm text-green-100 mt-1">{result.message || 'No threats detected - Safe to browse'}</p>
                    </div>
                  </div>
                </div>
              ) : result?.safe === false || result?.error ? (
                <Alert url={url || inputUrl} reason={result.reason} details={result} onWhitelist={()=>setShowWhitelist(true)} />
              ) : (
                <div className="flex-1 bg-white/15 backdrop-blur-xl rounded-xl p-8 border border-white/30 flex flex-col items-center justify-center text-center shadow-lg">
                  <div className="text-6xl mb-3">🛡️</div>
                  <h3 className="font-bold text-white text-base">Check Website Safety</h3>
                  <p className="text-sm text-gray-200 mt-2">Enter any URL above to scan for threats, phishing, and malware</p>
                </div>
              )}

              {showWhitelist && <Whitelist url={url} onClose={()=>setShowWhitelist(false)} />}
            </>
          )}

          {tab==='history' && (
            <History onStatsUpdate={loadStats} />
          )}

          {tab==='settings' && (
            <Settings />
          )}
        </div>
      </div>
    </div>
  )
}
