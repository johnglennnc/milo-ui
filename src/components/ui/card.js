import * as React from "react"

export const Card = ({ className, ...props }) => (
  <div className={`bg-gray-800 border border-gray-700 rounded-lg shadow-sm ${className}`} {...props} />
)

export const CardContent = ({ className, ...props }) => (
  <div className={`p-4 ${className}`} {...props} />
)
