import React, { useEffect, useState } from 'react'

const HISTORY_KEY = 'trustnet_ai_history'

export default function History({onStatsUpdate}){
  const [list, setList] = useState([])
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(()=>{
    load()
    // Listen for storage changes in other tabs/popups
    try {
      if (!chrome || !chrome.storage) {
        console.warn('⚠️ Chrome storage not available')
        return
      }
      const handleStorageChange = (changes, areaName) => {
        if(areaName === 'local' && changes[HISTORY_KEY]) {
          setList(changes[HISTORY_KEY].newValue || [])
        }
      }
      chrome.storage.onChanged.addListener(handleStorageChange)
      return () => chrome.storage.onChanged.removeListener(handleStorageChange)
    } catch(e) {
      console.error('❌ Error setting up storage listener:', e)
    }
  },[])

  function load(){
    try{
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('⚠️ Chrome storage not available')
        setList([])
        return
      }
      chrome.storage.local.get([HISTORY_KEY], res=>{
        setList(res[HISTORY_KEY] || [])
      })
    }catch(e){
      console.error('❌ History load error:', e)
    }
  }

  function clearHistory(){
    if(!confirm('Are you sure you want to clear all history?')) return
    try{
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('⚠️ Chrome storage not available')
        return
      }
      chrome.storage.local.set({[HISTORY_KEY]: []}, ()=>{
        setList([])
        if(onStatsUpdate) onStatsUpdate()
      })
    }catch(e){
      console.error('❌ clearHistory error:', e)
    }
  }

  function deleteItem(item){
    const updated = list.filter(it => it.ts !== item.ts)
    try{
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('⚠️ Chrome storage not available')
        return
      }
      chrome.storage.local.set({[HISTORY_KEY]: updated}, ()=>{
        setList(updated)
        if(onStatsUpdate) onStatsUpdate()
      })
    }catch(e){
      console.warn('deleteItem', e)
    }
  }

  function exportJson(){
    const blob = new Blob([JSON.stringify(list, null, 2)], {type:'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trustnet-ai-history-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportCSV(){
    const sanitizeCsvCell = (value) => {
      const text = String(value ?? '')
      return /^[=+\-@]/.test(text) ? `'${text}` : text
    }
    const headers = ['URL', 'Status', 'Reason', 'Timestamp']
    const rows = list.map(it => [
      sanitizeCsvCell(it.url),
      sanitizeCsvCell(it.safe ? 'Safe' : 'Unsafe'),
      sanitizeCsvCell(it.reason || 'N/A'),
      sanitizeCsvCell(new Date(it.ts).toLocaleString())
    ])
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], {type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trustnet-ai-history-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredList = list.filter(it => {
    const matchesFilter = filter === 'all' || (filter === 'safe' && it.safe) || (filter === 'unsafe' && !it.safe)
    const matchesSearch = !searchTerm || it.url.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const safeCount = list.filter(it => it.safe).length
  const unsafeCount = list.length - safeCount

  return (
    <div className="space-y-3 animate-fade-in max-h-[550px] flex flex-col overflow-hidden">
      {/* Header with Stats */}
      <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base text-blue-100 flex items-center gap-2">
            <span className="text-xl">📊</span>
            <span>Scan History</span>
          </h3>
          <div className="flex gap-1.5">
            <button
              onClick={exportCSV}
              className="px-2 py-1 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-300"
            >
              CSV
            </button>
            <button
              onClick={exportJson}
              className="px-2 py-1 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all duration-300"
            >
              JSON
            </button>
            <button
              onClick={clearHistory}
              className="px-2 py-1 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all duration-300"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          <div className="bg-white/10 backdrop-blur-sm p-2 rounded-lg text-center border border-white/20 hover:shadow-md transition-all duration-300">
            <div className="text-xs text-blue-200 font-bold">Total</div>
            <div className="text-xl font-bold text-white">{list.length}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm p-2 rounded-lg text-center border border-white/20 hover:shadow-md transition-all duration-300">
            <div className="text-xs text-green-200 font-bold">Safe</div>
            <div className="text-xl font-bold text-white">{safeCount}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm p-2 rounded-lg text-center border border-white/20 hover:shadow-md transition-all duration-300">
            <div className="text-xs text-red-200 font-bold">Threats</div>
            <div className="text-xl font-bold text-white">{unsafeCount}</div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="space-y-2">
          <input 
            type="text"
            placeholder="🔍 Search URLs..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border-2 border-white/30 bg-white/15 rounded-lg focus:border-blue-400 focus:outline-none transition-all duration-300 text-xs text-white placeholder-gray-300"
          />
          <div className="flex gap-1.5">
            {['all', 'safe', 'unsafe'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
                  filter === f
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-indigo-400/50 scale-105'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20 border border-white/20'
                }`}
              >
                {f === 'all' ? '🌐 All' : f === 'safe' ? '✅ Safe' : '⚠️ Threats'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filteredList.length === 0 ? (
          <div className="bg-white/10 backdrop-blur-xl rounded-xl p-6 shadow-lg text-center text-gray-300 border border-white/20">
            <div className="text-3xl mb-2">📭</div>
            <div className="text-xs font-medium">
              {searchTerm ? 'No results found' : list.length === 0 ? 'No scans yet' : 'No items match the filter'}
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredList.map((it, idx) => (
              <li 
                key={idx} 
                className={`bg-white/10 backdrop-blur-sm rounded-lg p-3 shadow-md hover:shadow-lg transition-all duration-300 border-l-4 hover:-translate-y-0.5 ${
                  it.safe ? 'border-green-500 hover:bg-white/20' : 'border-red-500 hover:bg-white/20'
                } border border-white/20`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{it.safe ? '✅' : '⚠️'}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        it.safe ? 'bg-green-500/30 text-green-100 border border-green-400/50' : 'bg-red-500/30 text-red-100 border border-red-400/50'
                      }`}>
                        {it.safe ? 'SAFE' : 'THREAT'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-100 break-all font-medium mb-1">{it.url}</div>
                    <div className="text-xs text-gray-400 font-medium">{new Date(it.ts).toLocaleString()}</div>
                    {it.reason && it.reason !== 'none' && (
                      <div className="mt-1.5 p-1.5 bg-white/10 rounded text-xs text-gray-300 border border-white/20">
                        <span className="font-bold">Reason:</span> {it.reason}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => deleteItem(it)}
                    className="text-gray-500 hover:text-red-400 transition-colors p-1 hover:bg-red-500/20 rounded"
                    title="Delete this entry"
                  >
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
