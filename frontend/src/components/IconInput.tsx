import type { InputHTMLAttributes, ReactNode } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  /** Icon shown inside the field, on the left (for example `<Search className="w-5 h-5" />`). */
  icon: ReactNode
  /** Classes for the wrapper, which carries the width (for example `w-1/2`). */
  wrapperClassName?: string
}

/** Text field with a leading icon. Same look as the plain inputs, with room on the left for the icon. */
export function IconInput({ icon, wrapperClassName = '', className = '', ...input }: Props) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400"
      >
        {icon}
      </span>
      <input
        {...input}
        className={`w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200 ${className}`}
      />
    </div>
  )
}
