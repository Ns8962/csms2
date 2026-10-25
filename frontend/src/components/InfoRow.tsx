import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  icon: LucideIcon
  label: string
  children: ReactNode
}

/** One "label: value" line of a result card, with a small icon in front of the label. */
export function InfoRow({ icon: Icon, label, children }: Props) {
  return (
    <p className="flex items-start gap-2 text-gray-300">
      <Icon className="mt-1 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
      <span>
        <span className="font-medium">{label}:</span> {children}
      </span>
    </p>
  )
}
