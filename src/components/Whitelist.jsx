import React, { useEffect, useState } from 'react'

export default function Whitelist({url, onClose}){
  const key = 'trustnet_ai_whitelist'
  const [list, setList] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [newDomain, setNewDomain] = useState('')

  useEffect(()=>{
    try {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('⚠️ Chrome storage not available')
        return
      }
      chrome.storage.local.get([key], res=>{
        setList(res[key] || [])
      })
    } catch(e) {
      console.error('❌ Error loading whitelist:', e)
    }
  },[])

  const remove = (host)=>{
    const next = list.filter(x=>x!==host)
    try {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('⚠️ Chrome storage not available')
        return
      }
      chrome.storage.local.set({[key]: next}, ()=>setList(next))
    } catch(e) {
      console.error('❌ Error removing from whitelist:', e)
    }
  }

  const addDomain = ()=>{
    if(!newDomain.trim()) return
    let domain = newDomain.trim()
    try{
      // Try to parse as URL
      const urlObj = new URL(domain.startsWith('http') ? domain : 'https://' + domain)
      domain = urlObj.hostname
    }catch(e){
      // Use as-is if not a valid URL
    }
    if(list.includes(domain)){
      alert('Domain already whitelisted')
      return
    }
    const next = [...list, domain]
    try {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('⚠️ Chrome storage not available')
        return
      }
      chrome.storage.local.set({[key]: next}, ()=>{
        setList(next)
        setNewDomain('')
      })
    } catch(e) {
      console.error('❌ Error adding to whitelist:', e)
    }
  }

  const addCurrentSite = ()=>{
    if(!url) return
    try{
      const domain = new URL(url).hostname
      if(list.includes(domain)){
        alert('Domain already whitelisted')
        return
      }
      const next = [...list, domain]
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('⚠️ Chrome storage not available')
        return
      }
      chrome.storage.local.set({[key]: next}, ()=>setList(next))
    }catch(e){
      alert('Invalid URL')
    }
  }

  const clearAll = ()=>{
    if(!confirm(`Remove all ${list.length} whitelisted domains?`)) return
    try {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('⚠️ Chrome storage not available')
        return
      }
      chrome.storage.local.set({[key]: []}, ()=>setList([]))
    } catch(e) {
      console.error('❌ Error clearing whitelist:', e)
    }
  }

  const filteredList = list.filter(host => 
    host.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 max-h-[80vh] overflow-hidden" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-xl flex items-center gap-2">
              <span>✅</span>
              <span>Trusted Sites</span>
            </h3>
            <button 
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-full w-8 h-8 flex items-center justify-center transition-all"
            >
              ✕
            </button>
          </div>
          <p className="text-sm opacity-90">Manage websites that bypass security checks</p>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Add Current Site */}
          {url && (
            <button
              onClick={addCurrentSite}
              className="w-full p-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <span>➕</span>
              <span>Trust Current Site</span>
            </button>
          )}

          {/* Add New Domain */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700">Add Domain Manually</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="example.com or https://example.com"
                value={newDomain}
                onChange={e=>setNewDomain(e.target.value)}
                onKeyDown={e=>e.key==='Enter' && addDomain()}
                className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none text-sm"
              />
              <button
                onClick={addDomain}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-all"
              >
                Add
              </button>
            </div>
          </div>

          {/* Search */}
          <div>
            <input
              type="text"
              placeholder="🔍 Search domains..."
              value={searchTerm}
              onChange={e=>setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none text-sm"
            />
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
            <div className="text-sm font-semibold text-gray-700">
              {filteredList.length} of {list.length} domains
            </div>
            {list.length > 0 && (
              <button
                onClick={clearAll}
                className="px-3 py-1 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition-all"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Domain List */}
          <div className="max-h-64 overflow-y-auto space-y-2">
            {filteredList.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">🔒</div>
                <div className="text-sm">
                  {list.length === 0 ? 'No trusted sites yet' : 'No matches found'}
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {filteredList.map(h=>(
                  <li key={h} className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all group">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-green-500">✓</span>
                      <span className="text-sm font-medium text-gray-700 truncate">{h}</span>
                    </div>
                    <button
                      className="text-gray-400 hover:text-red-600 transition-colors p-1 opacity-0 group-hover:opacity-100"
                      onClick={()=>remove(h)}
                      title="Remove from whitelist"
                    >
                      🗑️
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Info */}
          <div className="p-3 bg-yellow-50 border-l-4 border-yellow-500 rounded text-xs text-gray-700">
            <span className="font-semibold">⚠️ Warning:</span> Whitelisted sites will bypass all security checks. Only add sites you completely trust.
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
