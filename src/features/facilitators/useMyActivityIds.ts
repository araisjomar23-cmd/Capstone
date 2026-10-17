import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getMyFacilitatorId, getMyAssignedActivityIds } from './facilitatorPortalService'

export function useMyActivityIds() {
  const { userId } = useAuth()
  const [activityIds, setActivityIds] = useState<string[]>([])
  const [facilitatorId, setFacilitatorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!userId) {
        setLoading(false)
        return
      }
      const facId = await getMyFacilitatorId(userId)
      setFacilitatorId(facId)
      if (facId) {
        const ids = await getMyAssignedActivityIds(facId)
        setActivityIds(ids)
      }
      setLoading(false)
    }
    load()
  }, [userId])

  return { activityIds, facilitatorId, loading }
}