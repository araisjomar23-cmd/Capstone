import { useId } from 'react'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
}

export default function FloatingLabelInput({ label, value, onChange, autoComplete }: Props) {
  const id = useId()
  return (
    <div className="floating-label-field">
      <input id={id} type="text" value={value} onChange={(event) => onChange(event.target.value)}
        placeholder=" " autoComplete={autoComplete} className="input" />
      <label htmlFor={id}>{label}</label>
    </div>
  )
}
