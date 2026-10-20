import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getMyFacilitatorId, getMyAssignedActivityIds } from './facilitatorPortalService'
import { supabase } from '../../lib/supabase'

export function useMyActivityIds() {
  const { userId } = useAuth()
  const [activityIds, setActivityIds] = useState<string[]>([])
  const [facilitatorId, setFacilitatorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function load() {
      if (!userId) {
        setActivityIds([])
        setFacilitatorId(null)
        setLoading(false)
        return
      }
      const facId = await getMyFacilitatorId(userId)
      if (!active) return
      setFacilitatorId(facId)
      if (!facId) {
        setActivityIds([])
        setLoading(false)
        return
      }

      const refreshAssignments = async () => {
        const ids = await getMyAssignedActivityIds(facId)
        if (active) setActivityIds(ids)
      }

      channel = supabase
        .channel(`facilitator-assignments-${facId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'activity_facilitators',
          filter: `facilitator_id=eq.${facId}`,
        }, () => { void refreshAssignments() })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void refreshAssignments()
        })

      await refreshAssignments()
      setLoading(false)
    }

    void load()
    return () => {
      active = false
      if (channel) void supabase.removeChannel(channel)
    }
  }, [userId])

  return { activityIds, facilitatorId, loading }
}
