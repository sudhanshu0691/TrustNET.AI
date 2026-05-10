import axios from 'axios'
import { hashUrl, extractHostname } from './hashUtil'

const BACKEND = 'http://127.0.0.1:5000'
const API_TIMEOUT_KEY = 'trustnet_ai_api_timeout'

export async function getCurrentTabUrl(){
  return new Promise((resolve)=>{
    try{
      // Check if chrome.tabs is available
      if (!chrome || !chrome.tabs || !chrome.tabs.query) {
        console.error('❌ [API] chrome.tabs API not available')
        resolve(null)
        return
      }

      chrome.tabs.query({active:true,currentWindow:true}, (tabs)=>{
        if(!tabs || !chrome.runtime.lastError) {
          if(tabs && tabs[0] && tabs[0].url) {
            console.log('📍 [API] Current tab URL:', tabs[0].url)
            resolve(tabs[0].url)
          }
          else {
            console.warn('⚠️ [API] No active tab found')
            resolve(null)
          }
        } else {
          console.error('❌ [API] chrome.tabs.query error:', chrome.runtime.lastError)
          resolve(null)
        }
      })
    }catch(e){
      console.error('❌ [API] Error getting tab URL:', e)
      resolve(null)
    }
  })
}

export async function sendCheckRequest(url){
  const normalizedUrl = normalizeUrl(url)
  const hashed = await hashUrl(normalizedUrl)
  const domain = extractHostname(normalizedUrl)
  const timeoutMs = await getApiTimeoutMs()
  
  console.log('📤 [API] Sending check request:', {url, domain, hashed, timeout: timeoutMs})
  
  try{
    const resp = await axios.post(`${BACKEND}/check`, {
      url: normalizedUrl,
      hashed_url: hashed, 
      domain: domain 
    }, {
      timeout: timeoutMs
    })
    
    console.log('📥 [API] Backend response received:', {
      safe: resp.data.safe,
      reason: resp.data.reason,
      message: resp.data.message,
      fullData: resp.data
    })
    
    return {
      ...resp.data,
      url: normalizedUrl,
      domain: domain,
      timestamp: new Date().toISOString()
    }
  }catch(e){
    console.error('❌ [API] Error:', {
      code: e.code,
      message: e.message,
      response: e.response?.data
    })
    
    // If backend is down, return error state
    if(e.code === 'ECONNREFUSED' || e.code === 'ERR_NETWORK' || !e.response){
      console.warn('⚠️ [API] Backend server is offline')
      return {
        safe: false,
        reason: 'backend_offline',
        message: '❌ Backend server is not running. Start Flask backend with: python backend/app.py',
        error: true,
        threat_type: 'SERVICE_ERROR'
      }
    }
    
    // For other errors, be safe and mark as inconclusive
    console.warn('⚠️ [API] Request failed')
    return {
      safe: false,
      reason: 'error',
      message: `⚠️ Error checking URL: ${e.message}. Proceeding with caution.`,
      error: true,
      threat_type: 'UNKNOWN'
    }
  }
}

function normalizeUrl(url){
  if (!url) return ''
  const trimmed = String(url).trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

async function getApiTimeoutMs(){
  return new Promise((resolve)=>{
    try{
      chrome.storage.local.get([API_TIMEOUT_KEY], (res)=>{
        const seconds = Number(res?.[API_TIMEOUT_KEY])
        const safeSeconds = Number.isFinite(seconds) ? Math.min(Math.max(seconds, 5), 60) : 10
        resolve(safeSeconds * 1000)
      })
    }catch(e){
      resolve(10000)
    }
  })
}

export async function checkWhitelist(domain){
  return new Promise((resolve)=>{
    try{
      chrome.storage.local.get(['trustnet_ai_whitelist'], (res)=>{
        const whitelist = res.trustnet_ai_whitelist || []
        resolve(whitelist.includes(domain))
      })
    }catch(e){
      resolve(false)
    }
  })
}

export async function addToWhitelist(domain){
  return new Promise((resolve)=>{
    try{
      chrome.storage.local.get(['trustnet_ai_whitelist'], (res)=>{
        const whitelist = res.trustnet_ai_whitelist || []
        if(!whitelist.includes(domain)){
          whitelist.push(domain)
          chrome.storage.local.set({trustnet_ai_whitelist: whitelist}, ()=>{
            resolve(true)
          })
        }else{
          resolve(true)
        }
      })
    }catch(e){
      resolve(false)
    }
  })
}

export async function removeFromWhitelist(domain){
  return new Promise((resolve)=>{
    try{
      chrome.storage.local.get(['trustnet_ai_whitelist'], (res)=>{
        const whitelist = res.trustnet_ai_whitelist || []
        const updated = whitelist.filter(d => d !== domain)
        chrome.storage.local.set({trustnet_ai_whitelist: updated}, ()=>{
          resolve(true)
        })
      })
    }catch(e){
      resolve(false)
    }
  })
}
