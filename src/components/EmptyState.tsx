interface Props {
  icon: React.ReactNode
  title: string
  subtitle?: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, subtitle, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-4">
      <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 mb-4">
        {icon}
      </div>
      <div className="text-sm font-semibold text-gray-600 mb-1">{title}</div>
      {subtitle && <div className="text-xs text-gray-400 max-w-xs">{subtitle}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}