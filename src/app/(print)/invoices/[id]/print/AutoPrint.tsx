'use client'

import { useEffect } from 'react'

/**
 * Open the print sheet as soon as the bill is on screen. On a phone that sheet
 * is where "Save as PDF" and "Share" live, which is how the bill actually gets
 * to the transport company.
 */
export function AutoPrint() {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 400)
    return () => clearTimeout(id)
  }, [])
  return null
}
