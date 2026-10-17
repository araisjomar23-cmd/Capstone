export interface Registration {
  id: string
  ref: string
  registeredAt: string
  attendedAt: string | null
  notes: string
  status: 'registered' | 'attended' | 'completed' | 'inactive'
  name: string
  age: number | string
  gender: string
  contact: string
  barangay: string
  org: string
  activityId: string  
  activityTitle: string
  activityDate: string
  activityVenue: string
  program: string
  sectoralGroup: string
}