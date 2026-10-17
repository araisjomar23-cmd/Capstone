export interface Activity {
  id: string
  programId: string
  programName: string
  title: string
  colorBg: string
  tags: string[]
  status: 'open' | 'full' | 'upcoming' | 'closed'
  slots: number
  taken: number
  regCount: number
  venue: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  previewDesc: string
  fullDesc: string
  outcomes: string[]
  schedule: string[]
  bring: string[]
  note: string
  createdAt: string
  updatedAt: string
  budgetAlloc: number
  budgetSpent: number
  date: string
}