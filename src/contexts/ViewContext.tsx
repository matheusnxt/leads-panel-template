'use client'

import { createContext, useContext, useState } from 'react'

type View = 'list' | 'kanban'

type ViewContextType = {
  view: View
  setView: (v: View) => void
  search: string
  setSearch: (s: string) => void
}

const ViewContext = createContext<ViewContextType>({
  view: 'list',
  setView: () => {},
  search: '',
  setSearch: () => {},
})

export function ViewProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<View>('list')
  const [search, setSearch] = useState('')
  return (
    <ViewContext.Provider value={{ view, setView, search, setSearch }}>
      {children}
    </ViewContext.Provider>
  )
}

export const useView = () => useContext(ViewContext)
