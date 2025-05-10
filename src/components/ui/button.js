import * as React from "react"

export const Button = React.forwardRef(
  ({ className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 ${className}`}
        {...props}
      />
    )
  }
)
