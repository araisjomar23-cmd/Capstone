export const YOUTH_AGE_GROUPS = [
  { label: 'Child Youth', min: 15, max: 17 },
  { label: 'Core Youth', min: 18, max: 24 },
  { label: 'Adult Youth', min: 25, max: 30 },
] as const

export function getYouthAgeGroup(age: number | string | null | undefined): string {
  if (age == null || age === '') return ''
  const numericAge = Number(age)
  if (!Number.isInteger(numericAge)) return ''
  return YOUTH_AGE_GROUPS.find((group) => numericAge >= group.min && numericAge <= group.max)?.label ?? ''
}
