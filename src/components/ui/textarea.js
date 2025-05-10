import * as React from "react"

export const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={`w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-900 text-white placeholder-gray-500 ${className}`}
      {...props}
    />
  )
})
