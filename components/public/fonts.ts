import { Cormorant_Garamond, Inter_Tight } from "next/font/google"

// Fonts of the public page: a tight grotesk for the light sections and a
// serif for the film at the top.
export const display = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600"] })
export const serif = Cormorant_Garamond({ subsets: ["latin"], weight: ["300", "400", "500"] })
