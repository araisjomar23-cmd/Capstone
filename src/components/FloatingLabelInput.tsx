import { useId } from 'react'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  type?: 'text' | 'tel'
  optional?: boolean
}

export default function FloatingLabelInput({ label, value, onChange, autoComplete, type = 'text', optional = false }: Props) {
  const id = useId()
  return (
    <div className="floating-label-field">
      <input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)}
        placeholder=" " autoComplete={autoComplete} className="input" />
      <label htmlFor={id}>{label}{optional && <span className="floating-label-optional"> (optional)</span>}</label>
    </div>
  )
}
