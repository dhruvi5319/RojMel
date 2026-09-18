'use client'

import { createContext, useContext } from 'react'

/**
 * A panel or row editor tells the forms inside it how to close itself.
 *
 * Every add-form and row editor in this app sits inside something that opened
 * to show it, and none of them used to close again — you saved an expense and
 * the form stayed there, still full, looking exactly as it did before you
 * pressed the button. So a form cannot be left to remember to close: the thing
 * that opened it says how, and ActionForm does it on every save.
 */
export const DisclosureContext = createContext<(() => void) | null>(null)

export function useCloseDisclosure() {
  return useContext(DisclosureContext)
}
