import { useEffect } from 'react'

// Retain the optional argument for existing callers while keeping one system title.
export function usePageTitle(_title?: string) {
  useEffect(() => {
    document.title = 'PCYDO Prime'
  }, [])
}
