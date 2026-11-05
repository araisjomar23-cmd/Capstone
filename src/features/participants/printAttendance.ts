import type { Registration } from '../../types/registration'
import { activityDateLabel, type DatePeriod } from '../../lib/activityDatePeriod'
import letterhead from '../../assets/attendance/image1.jpeg'
import footer from '../../assets/attendance/image2.png'

export const ATTENDANCE_COLUMNS = ['NO', 'LAST NAME', 'FIRST NAME', 'M.I', 'AGE', 'SEX AT BIRTH', 'ADDRESS/OFFICE', 'SIGNATURE']
const ROWS_PER_PAGE = 15

export function attendanceName(row: Registration) {
  if (row.firstName?.trim() && row.lastName?.trim()) {
    return { first: row.firstName.trim(), last: [row.lastName.trim(), row.suffix].filter(Boolean).join(' '), middle: row.middleName?.trim() ? `${row.middleName.trim()[0]}.` : '' }
  }
  // Older registration snapshots contain only a full name (first, middle, last).
  const parts = row.name.trim().split(/\s+/).filter(Boolean)
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts.at(-1) ?? '') ? parts.pop()! : row.suffix || ''
  if (parts.length < 2) return { first: row.firstName || parts[0] || '', last: row.lastName || '', middle: '' }
  const last = parts.pop()!
  // Preserve common multiword surnames in legacy names.
  const surname = [last]
  while (parts.length > 1 && /^(de|del|dela|la|las|los|san|santa|santo|van|von)$/i.test(parts.at(-1)!)) surname.unshift(parts.pop()!)
  return {
    first: row.firstName?.trim() || parts[0],
    last: [row.lastName?.trim() || surname.join(' '), suffix].filter(Boolean).join(' '),
    middle: row.middleName?.trim() ? `${row.middleName.trim()[0]}.` : parts.length > 1 ? `${parts[1][0]}.` : '',
  }
}

export function attendanceTemplateRows(rows: Registration[]) {
  const groups = new Map<string, Registration[]>()
  for (const row of rows) {
    if (!row.activityId || row.status === 'not_registered') continue
    const group = groups.get(row.activityId) ?? []
    group.push(row)
    groups.set(row.activityId, group)
  }
  return [...groups.values()].map(group => [...group].sort((a, b) =>
    attendanceName(a).last.localeCompare(attendanceName(b).last, 'en-PH', { sensitivity: 'base' }) ||
    attendanceName(a).first.localeCompare(attendanceName(b).first, 'en-PH', { sensitivity: 'base' })))
}

/** Organization's YOUTH form, with one event per sheet and original artwork. */
export function printAttendance(rows: Registration[], period: DatePeriod) {
  const groups = attendanceTemplateRows(rows)
  if (!groups.length) return
  document.getElementById('participant-attendance-print')?.remove()
  const frame = document.createElement('iframe')
  frame.id = 'participant-attendance-print'
  frame.title = 'Attendance print sheet'
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:816px;height:1248px;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  const printWindow = frame.contentWindow
  if (!doc || !printWindow) { frame.remove(); return }
  doc.title = `CYDO Attendance - ${period.year || 'All years'}${period.month ? `-${period.month}` : ''}`
  const style = doc.createElement('style')
  style.textContent = `
    @page { size: 8.5in 13in; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 10pt Calibri, Arial, sans-serif; color: #000; }
    .sheet { width: 8.5in; min-height: 13in; padding: 0 9mm 28mm; position: relative; break-after: page; }
    .sheet:last-child { break-after: auto; }
    .letterhead { display: block; width: calc(100% + 18mm); height: 34mm; margin-left: -9mm; object-fit: fill; }
    h1 { text-align: center; font-size: 14pt; margin: 9mm 0 6mm; }
    .event { display: flex; margin: 2mm 7mm; font-size: 11pt; line-height: 1.3; }
    .event-label { width: 32mm; flex-shrink: 0; }
    .event-value { flex: 1; border-bottom: 1px solid #000; overflow-wrap: anywhere; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; margin-top: 5mm; }
    th, td { border: 1px solid #000; padding: 1.5mm; overflow-wrap: anywhere; }
    th { font-size: 10pt; height: 13mm; text-align: center; line-height: 1.2; }
    td { height: 9mm; font-size: 11pt; line-height: 1.3; vertical-align: middle; }
    th:first-child, td:first-child { font-family: Calibri, Arial, sans-serif; font-size: 7pt; }
    th:nth-child(2), td:nth-child(2), th:nth-child(3), td:nth-child(3),
    th:nth-child(7), td:nth-child(7), th:nth-child(8), td:nth-child(8) {
      font-family: Calibri, Arial, sans-serif;
      font-size: 10pt;
    }
    td:first-child, td:nth-child(4), td:nth-child(5) { text-align: center; }
    .signoff { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin: 8mm 5mm 0; font-family: 'Times New Roman', Times, serif; font-size: 12pt; }
    .signoff p { margin: 0 0 6mm; }
    .signoff strong { display: block; font-size: 12pt; }
    .signoff small { font-size: 12pt; }
    .footer { position: absolute; bottom: 0; left: 0; width: 100%; height: 27mm; object-fit: fill; }
  `
  doc.head.appendChild(style)
  const add = (tag: string, text: string, parent: HTMLElement, className = '') => {
    const element = doc.createElement(tag)
    element.textContent = text
    element.className = className
    parent.appendChild(element)
    return element
  }
  const images: HTMLImageElement[] = []
  const addImage = (src: string, alt: string, parent: HTMLElement, className: string) => {
    const img = doc.createElement('img')
    img.alt = alt
    img.className = className
    img.src = src
    parent.appendChild(img)
    images.push(img)
  }
  for (const group of groups) {
    const activity = group[0]
    for (let offset = 0; offset < group.length; offset += ROWS_PER_PAGE) {
      const sheet = add('section', '', doc.body, 'sheet')
      addImage(letterhead, 'City of Panabo - Office of the City Mayor, City Youth Development Section', sheet, 'letterhead')
      add('h1', 'ATTENDANCE', sheet)
      for (const [label, value] of [['Name of Event', activity.activityTitle], ['Place of Event', activity.activityVenue], ['Date of Event', activityDateLabel(activity.activityStartDate, activity.activityEndDate)]]) {
        const line = add('div', '', sheet, 'event')
        add('span', `${label}:`, line, 'event-label')
        add('span', value || '\u00a0', line, 'event-value')
      }
      const table = add('table', '', sheet)
      const cols = add('colgroup', '', table)
      for (const width of [4, 17, 20, 5, 5, 8, 25, 16]) add('col', '', cols).style.width = `${width}%`
      const head = add('thead', '', table)
      const headings = add('tr', '', head)
      for (const title of ATTENDANCE_COLUMNS) add('th', title, headings)
      const body = add('tbody', '', table)
      for (let index = 0; index < ROWS_PER_PAGE; index++) {
        const row = group[offset + index]
        const tr = add('tr', '', body)
        const name = row ? attendanceName(row) : null
        const address = row ? [row.barangay, row.cityMunicipality, row.province].filter(Boolean).join(', ') : ''
        const addressOffice = row?.org?.trim() ? `${address} / ${row.org.trim()}` : address
        const values = row && name ? [String(offset + index + 1), name.last, name.first, name.middle, String(row.age), '', addressOffice, ''] : [String(offset + index + 1), '', '', '', '', '', '', '']
        for (const value of values) add('td', value, tr)
      }
      const signoff = add('div', '', sheet, 'signoff')
      for (const [label, name, role] of [['Prepared by:', 'RODGI RUVIL V. GIBELA', 'Procurement In-Charge'], ['Noted by:', 'LESTER JOHN B. BULFANGO', 'OIC - City Youth Development Section']]) {
        const block = add('div', '', signoff)
        add('p', label, block)
        add('strong', name, block)
        add('small', role, block)
      }
      addImage(footer, 'Official Panabo City Youth Development Section footer', sheet, 'footer')
    }
  }
  void Promise.all(images.map(img => img.decode().catch(() => undefined))).then(() => {
    if (!frame.isConnected) return
    printWindow.addEventListener('afterprint', () => frame.remove(), { once: true })
    printWindow.focus()
    printWindow.print()
  })
}
