import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  description: string
}

/** Page title with an icon tile (the same icon as the page's sidebar button) and a one-line description. */
export function PageHeader({ icon: Icon, title, description }: Props) {
  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 ring-1 ring-inset ring-blue-400/20">
          <Icon className="h-6 w-6" />
        </span>
        <h1 className="text-2xl font-bold text-blue-400">{title}</h1>
      </div>
      <p className="text-gray-300 mb-4">{description}</p>
    </>
  )
}
