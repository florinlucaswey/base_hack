import React from 'react'

const Button = ({ children, className = '', ...props }) => {
  const baseClasses =
    'px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition'

  return (
    <button className={`${baseClasses} ${className}`.trim()} {...props}>
      {children}
    </button>
  )
}

export default Button
