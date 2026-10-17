import { supabase } from '../../lib/supabase'

export interface FacilitatorRow {
  id: string
  name: string
  initials: string
  userUuid: string | null
  email: string
  status: 'Active' | 'No Account'
  activityCount: number
}

export async function fetchFacilitatorsList(): Promise<FacilitatorRow[]> {
  const { data, error } = await supabase
    .from('facilitators')
    .select(`
      id, name, initials, user_uuid,
      activity_facilitators ( activity_id )
    `)
    .order('name')

  if (error) {
    console.error('fetchFacilitatorsList error:', error.message)
    return []
  }

  const uuids = (data || []).map((f: any) => f.user_uuid).filter(Boolean)
  let emailMap: Record<string, string> = {}

  if (uuids.length) {
    const { data: adminUsers } = await supabase
      .from('admin_users')
      .select('user_uuid, email')
      .in('user_uuid', uuids)

    ;(adminUsers || []).forEach((u: any) => {
      emailMap[u.user_uuid] = u.email
    })
  }

  return (data || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    initials: f.initials || f.name.charAt(0).toUpperCase(),
    userUuid: f.user_uuid,
    email: emailMap[f.user_uuid] || '—',
    status: f.user_uuid ? 'Active' : 'No Account',
    activityCount: f.activity_facilitators?.length || 0,
  }))
}

export interface CreateFacilitatorPayload {
  name: string
  initials: string
  email: string
  password: string
}

export async function createFacilitatorAccount(
  payload: CreateFacilitatorPayload
): Promise<{ ok: boolean; error?: string }> {
  const {
    data: { session: adminSession },
  } = await supabase.auth.getSession()

  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
  })

  if (signUpErr) {
    return { ok: false, error: signUpErr.message }
  }

  const userId = signUpData.user?.id
  if (!userId) {
    return { ok: false, error: 'Could not create auth account. Try again.' }
  }

  if (adminSession) {
    await supabase.auth.setSession({
      access_token: adminSession.access_token,
      refresh_token: adminSession.refresh_token,
    })
  }

  const { error: adminErr } = await supabase.from('admin_users').insert({
    user_uuid: userId,
    email: payload.email,
    display_name: payload.name,
    role: 'facilitator',
  })

  if (adminErr) {
    return { ok: false, error: adminErr.message }
  }

  const { error: facErr } = await supabase
    .from('facilitators')
    .insert({ name: payload.name, initials: payload.initials, user_uuid: userId })

  if (facErr) {
    return { ok: false, error: facErr.message }
  }

  return { ok: true }
}

export async function deleteFacilitator(id: string): Promise<boolean> {
  const { error } = await supabase.from('facilitators').delete().eq('id', id)
  if (error) {
    console.error('deleteFacilitator error:', error.message)
    return false
  }
  return true
}