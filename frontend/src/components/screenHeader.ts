import { createContext, type ReactNode } from 'react'

/** Lets a parent (e.g. the game page) supply a header to whichever screen is shown. */
export const ScreenHeaderContext = createContext<ReactNode>(null)
